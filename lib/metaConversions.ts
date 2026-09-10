import {getSupabaseAdmin} from "./supabaseAdmin";

const pixelPattern=/^[0-9]{8,24}$/;
const configuredGraphVersion=process.env.META_GRAPH_API_VERSION?.trim()||"";
const graphVersion=/^v\d+\.\d+$/.test(configuredGraphVersion)?configuredGraphVersion:"v22.0";
type MetaEventName="InitiateCheckout";
type MetaConversionInput={businessId:string;businessSlug:string;pixelId:string;event:MetaEventName;eventId:string;eventSourceUrl:string;userAgent:string;clientIp:string|null;fbp:string|null;fbc:string|null;customData:Record<string,unknown>};

const debugEnabled=()=>process.env.NODE_ENV!=="production"||process.env.META_CONVERSIONS_DIAGNOSTICS==="1";
const debug=(event:string,eventId:string,suppressed:boolean,details:Record<string,unknown>={})=>{if(debugEnabled())console.info("[Servonas Meta event]",{event,event_id:eventId,source:"server",suppressed,...details});};
const accessTokenForPixel=(pixelId:string)=>{
 const rawMap=process.env.META_CONVERSIONS_API_ACCESS_TOKENS?.trim();
 if(rawMap){try{const parsed=JSON.parse(rawMap) as Record<string,unknown>;const token=parsed[pixelId];if(typeof token==="string"&&token.trim())return token.trim();}catch{console.error("Meta CAPI token map is invalid JSON",{stage:"configuration",pixelId});}}
 const configuredPixel=process.env.META_CONVERSIONS_API_PIXEL_ID?.trim();
 const token=(process.env.META_CONVERSIONS_API_ACCESS_TOKEN||process.env.META_CAPI_ACCESS_TOKEN||process.env.FACEBOOK_CONVERSIONS_API_ACCESS_TOKEN)?.trim();
 return token&&configuredPixel===pixelId?token:null;
};
const safeMetaResponse=(value:unknown)=>{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const result=value as {events_received?:unknown;fbtrace_id?:unknown;error?:{message?:unknown;type?:unknown;code?:unknown;error_subcode?:unknown}};
 return {events_received:typeof result.events_received==="number"?result.events_received:null,fbtrace_id:typeof result.fbtrace_id==="string"?result.fbtrace_id:null,error:result.error?{message:typeof result.error.message==="string"?result.error.message.slice(0,500):null,type:typeof result.error.type==="string"?result.error.type:null,code:typeof result.error.code==="number"?result.error.code:null,error_subcode:typeof result.error.error_subcode==="number"?result.error.error_subcode:null}:null};
};
const safeCustomData=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).filter(([key,item])=>/^[a-z][a-z0-9_]{0,60}$/i.test(key)&&(typeof item==="string"||typeof item==="number"||typeof item==="boolean"||Array.isArray(item))).map(([key,item])=>[key,Array.isArray(item)?item.filter(entry=>typeof entry==="string"||typeof entry==="number").slice(0,50):item]));

export async function sendMetaConversion(input:MetaConversionInput){
 if(!pixelPattern.test(input.pixelId))return {sent:false,reason:"invalid_pixel" as const};
 const db=getSupabaseAdmin();
 if(!db)return {sent:false,reason:"database_unavailable" as const};
 const now=new Date().toISOString();
 const {error:claimError}=await db.from("meta_conversion_events").insert({business_id:input.businessId,pixel_id:input.pixelId,event_name:input.event,event_id:input.eventId,event_source_url:input.eventSourceUrl,status:"pending",last_attempt_at:now});
 if(claimError?.code==="23505"){debug(input.event,input.eventId,true,{businessId:input.businessId,reason:"ledger_duplicate"});return {sent:false,reason:"duplicate" as const};}
 if(claimError){console.error("Meta CAPI event claim failed",{stage:"event_claim",businessId:input.businessId,businessSlug:input.businessSlug,event:input.event,event_id:input.eventId,code:claimError.code});return {sent:false,reason:"claim_failed" as const};}
 const token=accessTokenForPixel(input.pixelId);
 if(!token){
  await db.from("meta_conversion_events").update({status:"configuration_missing",error_code:"access_token_missing",updated_at:new Date().toISOString()}).eq("business_id",input.businessId).eq("event_name",input.event).eq("event_id",input.eventId);
  console.warn("Meta CAPI event not sent",{stage:"configuration",businessId:input.businessId,businessSlug:input.businessSlug,pixelId:input.pixelId,event:input.event,event_id:input.eventId,reason:"access_token_missing"});
  return {sent:false,reason:"access_token_missing" as const};
 }
 const userData=Object.fromEntries(Object.entries({client_user_agent:input.userAgent||undefined,client_ip_address:input.clientIp||undefined,fbp:input.fbp||undefined,fbc:input.fbc||undefined}).filter(([,value])=>value));
 const body:Record<string,unknown>={data:[{event_name:input.event,event_time:Math.floor(Date.now()/1000),event_id:input.eventId,action_source:"website",event_source_url:input.eventSourceUrl,user_data:userData,custom_data:safeCustomData(input.customData)}]};
 const testEventCode=process.env.META_CONVERSIONS_API_TEST_EVENT_CODE?.trim();
 if(testEventCode)body.test_event_code=testEventCode;
 try{
  const endpoint=`https://graph.facebook.com/${graphVersion}/${input.pixelId}/events`;
  const response=await fetch(endpoint,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
  const responseText=await response.text(),parsed=(()=>{try{return JSON.parse(responseText) as unknown;}catch{return null;}})(),safeResponse=safeMetaResponse(parsed);
  const result=(parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{}) as {events_received?:number;fbtrace_id?:string;error?:{message?:string;type?:string;code?:number;error_subcode?:number}};
  if(!response.ok||result.error||Number(result.events_received??0)<1)throw Object.assign(new Error(result.error?.message||`Meta CAPI returned HTTP ${response.status}`),{status:response.status,code:result.error?.code,subcode:result.error?.error_subcode,type:result.error?.type,traceId:result.fbtrace_id,endpoint,safeResponse});
  await db.from("meta_conversion_events").update({status:"sent",provider_trace_id:result.fbtrace_id??null,response_events_received:Number(result.events_received),sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("business_id",input.businessId).eq("event_name",input.event).eq("event_id",input.eventId);
  debug(input.event,input.eventId,false,{businessId:input.businessId,pixelId:input.pixelId,eventsReceived:result.events_received,providerTraceId:result.fbtrace_id??null});
  return {sent:true,reason:"sent" as const};
 }catch(error){
  const details=error as Error&{status?:number;code?:number;subcode?:number;type?:string;traceId?:string;endpoint?:string;safeResponse?:ReturnType<typeof safeMetaResponse>};
  await db.from("meta_conversion_events").update({status:"failed",http_status:details.status??null,error_code:details.code==null?null:String(details.code),error_message:details.message.slice(0,500),provider_trace_id:details.traceId??null,updated_at:new Date().toISOString()}).eq("business_id",input.businessId).eq("event_name",input.event).eq("event_id",input.eventId);
  console.error("Meta CAPI event failed",{stage:"event_send",businessId:input.businessId,businessSlug:input.businessSlug,pixelId:input.pixelId,event:input.event,event_id:input.eventId,graphVersion,endpoint:details.endpoint??null,httpStatus:details.status??null,errorCode:details.code??null,errorSubcode:details.subcode??null,errorType:details.type??null,providerTraceId:details.traceId??null,message:details.message,response:details.safeResponse??null});
  return {sent:false,reason:"provider_error" as const};
 }
}
