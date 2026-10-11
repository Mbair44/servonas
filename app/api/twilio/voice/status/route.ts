import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {twilioWebhookUrl,validTwilioSignature} from "@/lib/twilioWebhook";
import {missedInboundVoiceTwiml,normalizeVoicePhone,voiceAnswerType} from "@/lib/twilio/voice";
import {sendTenantTwilioMessage} from "@/lib/twilio/messageUsage";

export const runtime="nodejs";
const terminal=new Set(["completed","busy","no-answer","failed","canceled"]);
const xml=(body='<?xml version="1.0" encoding="UTF-8"?><Response/>')=>new Response(body,{status:200,headers:{"Content-Type":"text/xml; charset=utf-8"}});
const normalizedStatus=(value:string|null)=>((value??"initiated").replace(/-/g,"_"));
// Temporary production trace for the Dial action investigation. It deliberately
// excludes caller data, form content, webhook signatures, and account tokens.
const voiceDiagnostics=(message:string,details:Record<string,unknown>)=>console.info(message,details);

async function sendMissedCallSms(input:{call:{id:string;business_id:string;from_number:string;missed_call_sms_sent_at:string|null;missed_call_sms_claimed_at:string|null};settings:{missed_call_sms_enabled?:boolean|null;missed_call_sms_body?:string|null}|null;businessName:string|null}){
 if(!input.settings?.missed_call_sms_enabled||input.call.missed_call_sms_sent_at||input.call.missed_call_sms_claimed_at)return;
 const db=getSupabaseAdmin();if(!db)return;
 const now=new Date().toISOString();
 const {data:claimed}=await db.from("voice_calls").update({missed_call_sms_claimed_at:now,updated_at:now}).eq("id",input.call.id).is("missed_call_sms_sent_at",null).is("missed_call_sms_claimed_at",null).select("id").maybeSingle();
 if(!claimed)return;
 const body=(input.settings.missed_call_sms_body||"Hi! Sorry we missed your call — this is {{business_name}}. How can we help? 🎉").replace(/{{business_name}}/g,input.businessName||"your rental business");
 console.info("Twilio voice missed-call SMS attempted",{businessId:input.call.business_id,callId:input.call.id});
 try{
  await sendTenantTwilioMessage({businessId:input.call.business_id,to:input.call.from_number,body,sourceType:"voice_missed_call",sourceId:input.call.id});
  await db.from("voice_calls").update({missed_call_sms_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",input.call.id).eq("missed_call_sms_claimed_at",now);
  console.info("Twilio voice missed-call SMS sent",{businessId:input.call.business_id,callId:input.call.id});
 }catch(error){
  // Keep the claim after an uncertain provider request; retrying could send a duplicate.
  console.error("Twilio voice missed-call SMS failed",{businessId:input.call.business_id,callId:input.call.id,error:error instanceof Error?error.message:"unknown"});
 }
}

async function handleStatus(request:Request){
 const params=new URLSearchParams(await request.text()),url=new URL(request.url),sid=params.get("CallSid")??"",accountSid=params.get("AccountSid")??"",parent=url.searchParams.get("parent")||params.get("ParentCallSid")||sid,employeeId=url.searchParams.get("employee"),businessParam=url.searchParams.get("business"),status=normalizedStatus(params.get("CallStatus")??params.get("DialCallStatus")),now=new Date().toISOString();
 const signatureUrl=twilioWebhookUrl(request,"TWILIO_VOICE_STATUS_WEBHOOK_URL"),signature=request.headers.get("x-twilio-signature")??"",isDialAction=Boolean(url.searchParams.get("parent"))&&!employeeId&&!url.searchParams.get("recording");
 const db=getSupabaseAdmin();if(!db)return xml();
 const {data:call}=await db.from("voice_calls").select("id,business_id,from_number,to_number,human_answered,was_missed,missed_call_sms_sent_at,missed_call_sms_claimed_at,businesses(name),business_voice_settings(missed_call_sms_enabled,missed_call_sms_body)").eq("twilio_call_sid",parent).maybeSingle();
 if(!call||businessParam&&businessParam!==call.business_id){
  voiceDiagnostics("Twilio voice status callback unresolved",{callSid:sid,parentCallSid:parent,dialCallStatus:params.get("DialCallStatus")??null,callStatus:params.get("CallStatus")??null,isDialAction,requestUrl:request.url,businessParam});
  return xml();
 }
 const {data:account}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",call.business_id).eq("twilio_subaccount_sid",accountSid).maybeSingle();
 const token=account?.twilio_subaccount_sid?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:call.business_id,subaccountSid:account.twilio_subaccount_sid}):null;
 const signatureValid=Boolean(token&&validTwilioSignature(signatureUrl,params,signature,token));
 voiceDiagnostics("Twilio voice status callback received",{businessId:call.business_id,callSid:sid,parentCallSid:parent,accountSid,employeeId:employeeId??null,isDialAction,dialCallStatus:params.get("DialCallStatus")??null,callStatus:params.get("CallStatus")??null,requestUrl:request.url,signatureUrl,signaturePresent:Boolean(signature),signatureValid,recording:Boolean(url.searchParams.get("recording"))});
 if(!signatureValid){console.error("Twilio voice status signature rejected",{callSid:sid,parentCallSid:parent,businessId:call.business_id,isDialAction,requestUrl:request.url,signatureUrl,signaturePresent:Boolean(signature)});return NextResponse.json({error:"Invalid signature"},{status:403});}
 const voicemail=()=>{
  const twiml=missedInboundVoiceTwiml({callId:parent,businessId:call.business_id,origin:`${url.protocol}//${url.host}`});
  voiceDiagnostics("Twilio voice Dial action voicemail response",{businessId:call.business_id,callSid:sid,parentCallSid:parent,dialCallStatus:params.get("DialCallStatus")??null,httpStatus:200,contentType:"text/xml; charset=utf-8",twiml});
  return xml(twiml);
 };
 if(url.searchParams.get("recording")){
  const recordingSid=params.get("RecordingSid"),recordingStatus=params.get("RecordingStatus"),duration=Number(params.get("RecordingDuration")||0)||null;
  await db.from("voice_calls").update({recording_sid:recordingSid||undefined,recording_status:recordingStatus||"completed",recording_duration_seconds:duration,updated_at:now}).eq("id",call.id);
  console.info("Twilio voice voicemail recording callback",{businessId:call.business_id,callId:call.id,callSid:parent,recordingSid:recordingSid||null,recordingStatus:recordingStatus||null});
  return xml();
 }
 const voiceSettings=Array.isArray(call.business_voice_settings)?call.business_voice_settings[0]:call.business_voice_settings;
 const business=Array.isArray(call.businesses)?call.businesses[0]:call.businesses;
 if(employeeId){
  const answerType=voiceAnswerType(params.get("AnsweredBy")),phone=normalizeVoicePhone(params.get("To")??"");
  if(sid&&phone){
   const leg:Record<string,unknown>={business_id:call.business_id,call_id:call.id,twilio_call_sid:sid,employee_id:employeeId,phone_e164:phone,status,ended_at:terminal.has(status.replace(/_/g,"-"))?now:null,duration_seconds:Number(params.get("CallDuration")||0)||null,updated_at:now};
   // Status callbacks commonly omit AnsweredBy. Do not erase a classification
   // already written by the AMD callback or synchronous screening endpoint.
   if(answerType!=="unknown")leg.answer_type=answerType;
   if(answerType==="human")leg.answered_at=now;
   if(answerType==="machine")leg.machine_detected_at=now;
   await db.from("voice_call_legs").upsert(leg,{onConflict:"twilio_call_sid"});
   console.info(status==="initiated"?"Twilio voice staff leg initiated":"Twilio voice staff leg completed",{businessId:call.business_id,callId:call.id,legSid:sid,employeeId,status,answerType});
   if(answerType!=="unknown")console.info("Twilio voice AMD result",{businessId:call.business_id,callId:call.id,legSid:sid,employeeId,answerType});
  }
  // Only staff-answer may accept a human. A raw answered/in-progress callback
  // is not evidence that a person, rather than carrier voicemail, answered.
  return xml();
 }
 const isRoutingComplete=Boolean(url.searchParams.get("parent"));
 if(!isRoutingComplete)return xml();
 if(call.human_answered){
  await db.from("voice_calls").update({status:"completed",was_missed:false,ended_at:now,duration_seconds:Number(params.get("DialCallDuration")||params.get("CallDuration")||0)||null,updated_at:now}).eq("id",call.id);
  return xml();
 }
 const {data:missed}=await db.from("voice_calls").update({status:"no_answer",was_missed:true,ended_at:now,duration_seconds:Number(params.get("DialCallDuration")||params.get("CallDuration")||0)||null,updated_at:now}).eq("id",call.id).eq("human_answered",false).eq("was_missed",false).select("id,business_id,from_number,missed_call_sms_sent_at,missed_call_sms_claimed_at").maybeSingle();
 if(missed){
  console.info("Twilio voice voicemail fallback",{businessId:call.business_id,callId:call.id,callSid:parent,dialCallStatus:status});
  // Never await notification delivery in Twilio's answer path. An SMS outage
  // must not prevent the caller from receiving voicemail TwiML.
  void sendMissedCallSms({call:missed,settings:voiceSettings,businessName:business?.name??null});
 }
 if(!missed)voiceDiagnostics("Twilio voice Dial action returned empty TwiML",{businessId:call.business_id,callSid:sid,parentCallSid:parent,dialCallStatus:params.get("DialCallStatus")??null,status,humanAnswered:call.human_answered,wasMissed:call.was_missed,httpStatus:200,contentType:"text/xml; charset=utf-8",twiml:'<?xml version="1.0" encoding="UTF-8"?><Response/>'});
 return missed?voicemail():xml();
}

export async function POST(request:Request){
 try{return await handleStatus(request);}catch(error){
  // Twilio must receive TwiML even if persistence or notifications are down.
  console.error("Twilio voice status callback failed",{error:error instanceof Error?error.message:"unknown"});
  return xml('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry we missed your call. Please leave a message after the beep.</Say><Record playBeep="true" maxLength="120"/><Hangup/></Response>');
 }
}
