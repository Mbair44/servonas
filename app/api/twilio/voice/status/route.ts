import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {twilioWebhookUrl,validTwilioSignature} from "@/lib/twilioWebhook";
import {resolveTenantOutboundSender} from "@/lib/twilio/tenantOutboundSender";
export const runtime="nodejs";
const terminal=new Set(["completed","busy","no-answer","failed","canceled"]);
export async function POST(request:Request){
 const params=new URLSearchParams(await request.text()),sid=params.get("CallSid")??"",accountSid=params.get("AccountSid")??"",parent=new URL(request.url).searchParams.get("parent")||params.get("ParentCallSid")||sid;
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data:call}=await db.from("voice_calls").select("id,business_id,from_number,to_number,missed_call_sms_sent_at,business_voice_settings(missed_call_sms_enabled,missed_call_sms_body)").eq("twilio_call_sid",parent).maybeSingle();
 if(!call)return NextResponse.json({error:"Unknown call"},{status:404});
 const {data:account}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",call.business_id).eq("twilio_subaccount_sid",accountSid).maybeSingle();
 const token=account?.twilio_subaccount_sid?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:call.business_id,subaccountSid:account.twilio_subaccount_sid}):null;
 if(!token||!validTwilioSignature(twilioWebhookUrl(request,"TWILIO_VOICE_STATUS_WEBHOOK_URL"),params,request.headers.get("x-twilio-signature")??"",token))return NextResponse.json({error:"Invalid signature"},{status:403});
 const status=(params.get("CallStatus")??params.get("DialCallStatus")??"initiated").replace(/-/g,"_");const now=new Date().toISOString(),employeeId=new URL(request.url).searchParams.get("employee");
 if(employeeId&&params.get("CallStatus")==="in-progress")await db.from("voice_calls").update({status:"in_progress",answered_at:now,answered_by_employee_id:employeeId}).eq("id",call.id);
 else await db.from("voice_calls").update({status,ended_at:terminal.has(status.replace(/_/g,"-"))?now:null,duration_seconds:Number(params.get("CallDuration")||0)||null,was_missed:["no_answer","busy","failed","canceled"].includes(status)}).eq("id",call.id);
 const voiceSettings=Array.isArray(call.business_voice_settings)?call.business_voice_settings[0]:call.business_voice_settings;
 if(["no_answer","busy","failed","canceled"].includes(status)&&voiceSettings?.missed_call_sms_enabled&&!call.missed_call_sms_sent_at){
  const claimed=await db.from("voice_calls").update({missed_call_sms_sent_at:now}).eq("id",call.id).is("missed_call_sms_sent_at",null).select("id").maybeSingle();
  if(claimed.data){try{const sender=await resolveTenantOutboundSender(call.business_id);if(sender.configured&&sender.accountSid&&sender.username&&sender.password&&sender.from){const body=voiceSettings.missed_call_sms_body.replace(/{{business_name}}/g,"your rental business");await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sender.accountSid}/Messages.json`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${sender.username}:${sender.password}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({To:call.from_number,From:sender.from,Body:body})});}}catch{console.error("Twilio voice missed-call SMS failed",{businessId:call.business_id,callId:call.id});}}
 }
 return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>",{headers:{"Content-Type":"text/xml"}});
}
