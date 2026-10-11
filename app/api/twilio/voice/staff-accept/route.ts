import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {validTwilioSignature} from "@/lib/twilioWebhook";

export const runtime="nodejs";
const xml=(body:string)=>new Response(body,{headers:{"Content-Type":"text/xml; charset=utf-8"}});
const hangup=()=>xml('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');

/** Atomically lets the first staff member who presses 1 bridge the parent Dial. */
export async function POST(request:Request){
 const params=new URLSearchParams(await request.text()),url=new URL(request.url),parent=url.searchParams.get("parent")??params.get("ParentCallSid")??"",employeeId=url.searchParams.get("employee")??"",businessId=url.searchParams.get("business")??"",childCallSid=url.searchParams.get("child")??params.get("CallSid")??"",accountSid=params.get("AccountSid")??"",digit=params.get("Digits")??"";
 const db=getSupabaseAdmin();if(!db)return hangup();
 const {data:call}=await db.from("voice_calls").select("id,business_id").eq("twilio_call_sid",parent).eq("business_id",businessId).maybeSingle();
 const {data:account}=call?await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",call.business_id).eq("twilio_subaccount_sid",accountSid).maybeSingle():{data:null};
 const token=account?.twilio_subaccount_sid&&call?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:call.business_id,subaccountSid:account.twilio_subaccount_sid}):null;
 if(!call||!token||!validTwilioSignature(request.url,params,request.headers.get("x-twilio-signature")??"",token))return hangup();
 if(digit!=="1"){
  console.info("Twilio staff screening rejected",{businessId:call.business_id,parentCallSid:parent,childCallSid,employeeId,reason:digit?"invalid_digit":"timeout"});
  return hangup();
 }
 const now=new Date().toISOString(),{data:accepted}=await db.from("voice_calls").update({human_answered:true,was_missed:false,status:"in_progress",answered_at:now,answered_by_employee_id:employeeId,updated_at:now}).eq("id",call.id).eq("human_answered",false).eq("was_missed",false).select("id").maybeSingle();
 if(!accepted){
  console.info("Twilio staff screening rejected",{businessId:call.business_id,parentCallSid:parent,childCallSid,employeeId,reason:"already_claimed"});
  return hangup();
 }
 await db.from("voice_call_legs").update({status:"accepted",answered_at:now,updated_at:now}).eq("twilio_call_sid",childCallSid).eq("call_id",call.id);
 console.info("Twilio staff screening accepted",{businessId:call.business_id,parentCallSid:parent,childCallSid,employeeId,digit:"1"});
 return xml('<?xml version="1.0" encoding="UTF-8"?><Response/>');
}
