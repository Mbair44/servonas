import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {normalizeVoicePhone,voiceXml} from "@/lib/twilio/voice";
import {validTwilioSignature} from "@/lib/twilioWebhook";

export const runtime="nodejs";
const xml=(body:string)=>new Response(body,{headers:{"Content-Type":"text/xml; charset=utf-8"}});
const hangup=()=>xml('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');

/** Runs only on the answered staff child leg; the customer remains in Dial. */
export async function POST(request:Request){
 const params=new URLSearchParams(await request.text()),url=new URL(request.url),parent=url.searchParams.get("parent")??params.get("ParentCallSid")??"",employeeId=url.searchParams.get("employee")??"",businessId=url.searchParams.get("business")??"",childCallSid=params.get("CallSid")??"",accountSid=params.get("AccountSid")??"",phone=normalizeVoicePhone(params.get("To")??"");
 const db=getSupabaseAdmin();if(!db)return hangup();
 const {data:call}=await db.from("voice_calls").select("id,business_id,human_answered").eq("twilio_call_sid",parent).eq("business_id",businessId).maybeSingle();
 const {data:account}=call?await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",call.business_id).eq("twilio_subaccount_sid",accountSid).maybeSingle():{data:null};
 const token=account?.twilio_subaccount_sid&&call?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:call.business_id,subaccountSid:account.twilio_subaccount_sid}):null;
 if(!call||!token||!validTwilioSignature(request.url,params,request.headers.get("x-twilio-signature")??"",token))return hangup();
 if(!childCallSid||!employeeId||!phone||call.human_answered){
  console.info("Twilio staff screening rejected",{businessId:call.business_id,parentCallSid:parent,childCallSid:childCallSid||null,employeeId:employeeId||null,reason:call.human_answered?"already_claimed":"missing_required_parameters"});
  return hangup();
 }
 const now=new Date().toISOString();
 await db.from("voice_call_legs").upsert({business_id:call.business_id,call_id:call.id,twilio_call_sid:childCallSid,employee_id:employeeId,phone_e164:phone,status:"screening",updated_at:now},{onConflict:"twilio_call_sid"});
 const accept=`${url.protocol}//${url.host}/api/twilio/voice/staff-accept?parent=${encodeURIComponent(parent)}&employee=${encodeURIComponent(employeeId)}&business=${encodeURIComponent(call.business_id)}&child=${encodeURIComponent(childCallSid)}`;
 console.info("Twilio staff screening started",{businessId:call.business_id,parentCallSid:parent,childCallSid,employeeId});
 return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" timeout="5" actionOnEmptyResult="true" action="${voiceXml(accept)}" method="POST"><Say>Incoming Servonas call. Press 1 to answer.</Say></Gather><Hangup/></Response>`);
}
