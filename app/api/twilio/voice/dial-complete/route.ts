import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {after} from "next/server";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {dialCompletionAction,missedInboundVoiceTwiml} from "@/lib/twilio/voice";
import {validTwilioSignature} from "@/lib/twilioWebhook";
import {sendTenantTwilioMessage} from "@/lib/twilio/messageUsage";

export const runtime="nodejs";
const xml=(body:string)=>new Response(body,{status:200,headers:{"Content-Type":"text/xml; charset=utf-8"}});
const empty=()=>xml('<?xml version="1.0" encoding="UTF-8"?><Response/>');
const normalizeStatus=(value:string|null)=>(value??"").replace(/-/g,"_").toLowerCase();

async function sendMissedCallSms(input:{parentCallSid:string;call:{id:string;business_id:string;from_number:string;missed_call_sms_sent_at:string|null;missed_call_sms_claimed_at:string|null};settings:{missed_call_sms_enabled?:boolean|null;missed_call_sms_body?:string|null}|null;businessName:string|null}){
 // A missing settings row preserves the product default: send the recovery
 // text. Only an explicit administrator opt-out suppresses it.
 if(input.settings?.missed_call_sms_enabled===false||input.call.missed_call_sms_sent_at)return;
 const db=getSupabaseAdmin();if(!db)return;
 const now=new Date().toISOString(),{data:claimed}=await db.from("voice_calls").update({missed_call_sms_claimed_at:now,updated_at:now}).eq("id",input.call.id).is("missed_call_sms_sent_at",null).is("missed_call_sms_claimed_at",null).select("id").maybeSingle();
 if(!claimed){console.info("Twilio missed-call SMS already claimed",{businessId:input.call.business_id,parentCallSid:input.parentCallSid,to:input.call.from_number});return;}
 const body=(input.settings?.missed_call_sms_body||"Hi! Sorry we missed your call — this is {{business_name}}. How can we help? 🎉").replace(/{{business_name}}/g,input.businessName||"your rental business");
 console.info("Twilio missed-call SMS sending",{businessId:input.call.business_id,parentCallSid:input.parentCallSid,to:input.call.from_number});
 try{const result=await sendTenantTwilioMessage({businessId:input.call.business_id,to:input.call.from_number,body,sourceType:"voice_missed_call",sourceId:input.call.id});await db.from("voice_calls").update({missed_call_sms_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",input.call.id).eq("missed_call_sms_claimed_at",now);console.info("Twilio missed-call SMS sent",{businessId:input.call.business_id,parentCallSid:input.parentCallSid,to:input.call.from_number,messageSid:result.sid});}
 catch(error){console.error("Twilio missed-call SMS failed",{businessId:input.call.business_id,parentCallSid:input.parentCallSid,to:input.call.from_number,error:error instanceof Error?error.message:"unknown"});}
}

/** The <Dial action> continuation. Its TwiML controls the original inbound caller. */
export async function POST(request:Request){
 const params=new URLSearchParams(await request.text()),url=new URL(request.url),parent=url.searchParams.get("parent")??params.get("CallSid")??"",businessId=url.searchParams.get("business")??"",accountSid=params.get("AccountSid")??"",dialCallSid=params.get("DialCallSid")??null,dialCallStatus=normalizeStatus(params.get("DialCallStatus")),fallback=url.searchParams.get("fallback")==="1",db=getSupabaseAdmin();
 if(!db)return empty();
 try{
  const {data:call,error:callError}=await db.from("voice_calls").select("id,business_id,from_number,human_answered,answered_at,answered_by_employee_id,was_missed,missed_call_sms_sent_at,missed_call_sms_claimed_at").eq("twilio_call_sid",parent).eq("business_id",businessId).maybeSingle();
  if(callError||!call){console.error("Twilio Dial completed unresolved",{parentCallSid:parent,dialCallSid,dialCallStatus,businessId,reason:callError?.message??"call_not_found"});return empty();}
  const {data:account}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",call.business_id).eq("twilio_subaccount_sid",accountSid).maybeSingle();
  const token=account?.twilio_subaccount_sid?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:call.business_id,subaccountSid:account.twilio_subaccount_sid}):null;
  if(!token||!validTwilioSignature(request.url,params,request.headers.get("x-twilio-signature")??"",token)){console.error("Twilio Dial completed signature rejected",{businessId:call.business_id,parentCallSid:parent,dialCallSid,dialCallStatus,requestUrl:request.url});return empty();}
  const action=dialCompletionAction({humanAccepted:call.human_answered,dialCallStatus,fallback});
  if(action==="complete"){console.info("Twilio Dial completed",{businessId:call.business_id,parentCallSid:parent,dialCallSid,dialCallStatus,humanAccepted:true,answeredByEmployeeId:call.answered_by_employee_id,action});return empty();}
  const twiml=missedInboundVoiceTwiml({callId:parent,businessId:call.business_id,origin:`${url.protocol}//${url.host}`});
  // The parent call gets TwiML even if the optional audit/SMS work fails.
  console.info("Twilio Dial completed",{businessId:call.business_id,parentCallSid:parent,dialCallSid,dialCallStatus,humanAccepted:false,answeredByEmployeeId:call.answered_by_employee_id,action,httpStatus:200,contentType:"text/xml; charset=utf-8",twiml});
  try{
   // `human_answered` is the sole eligibility condition. `was_missed` is a
   // display/audit state and may already be true on a retried Dial callback.
   const now=new Date().toISOString(),{data:marked,error:markError}=await db.from("voice_calls").update({status:"no_answer",was_missed:true,ended_at:now,duration_seconds:Number(params.get("DialCallDuration")||0)||null,updated_at:now}).eq("id",call.id).eq("human_answered",false).select("id,business_id,from_number,missed_call_sms_sent_at,missed_call_sms_claimed_at").maybeSingle();
   if(markError)console.error("Twilio Dial completed persistence failed",{businessId:call.business_id,parentCallSid:parent,error:markError.message});
   if(marked){
    const [{data:settings},{data:business}]=await Promise.all([db.from("business_voice_settings").select("missed_call_sms_enabled,missed_call_sms_body").eq("business_id",call.business_id).maybeSingle(),db.from("businesses").select("name").eq("id",call.business_id).maybeSingle()]);
    console.info("Twilio missed-call SMS queued",{businessId:call.business_id,parentCallSid:parent,to:marked.from_number});
    // `after` is a supported post-response lifecycle on Vercel. The caller
    // receives voicemail TwiML immediately; the durable database claim still
    // prevents duplicate sends if Twilio retries this Dial callback.
    after(()=>sendMissedCallSms({parentCallSid:parent,call:marked,settings,businessName:business?.name??null}));
   }
  }catch(error){console.error("Twilio Dial completed persistence threw",{businessId:call.business_id,parentCallSid:parent,error:error instanceof Error?error.message:"unknown"});}
  return xml(twiml);
 }catch(error){console.error("Twilio Dial completed failed",{parentCallSid:parent,dialCallSid,dialCallStatus,error:error instanceof Error?error.message:"unknown"});return empty();}
}
