import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {validTwilioSignature} from "@/lib/twilioWebhook";
import {normalizeVoicePhone,voiceAnswerType} from "@/lib/twilio/voice";

export const runtime="nodejs";
const hangup=()=>new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',{headers:{"Content-Type":"text/xml"}});
const continueDial=()=>new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>',{headers:{"Content-Type":"text/xml"}});

/**
 * Twilio invokes Number.url after a staff leg answers. AMD is useful context,
 * but not a bridge gate: it can be absent, slow, or wrong for a real employee.
 */
export async function POST(request:Request){
 const params=new URLSearchParams(await request.text()),url=new URL(request.url),parent=url.searchParams.get("parent")??params.get("ParentCallSid")??"",employeeId=url.searchParams.get("employee")??"",businessId=url.searchParams.get("business")??"",sid=params.get("CallSid")??"",accountSid=params.get("AccountSid")??"",phone=normalizeVoicePhone(params.get("To")??"");
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data:call}=await db.from("voice_calls").select("id,business_id,was_missed").eq("twilio_call_sid",parent).eq("business_id",businessId).maybeSingle();
 const {data:account}=call?await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",call.business_id).eq("twilio_subaccount_sid",accountSid).maybeSingle():{data:null};
 const token=account?.twilio_subaccount_sid&&call?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:call.business_id,subaccountSid:account.twilio_subaccount_sid}):null;
 // This callback has per-call query parameters. Twilio signs its exact public
 // URL, so a configured static base URL cannot validate it correctly.
 if(!call||!token||!validTwilioSignature(request.url,params,request.headers.get("x-twilio-signature")??"",token))return NextResponse.json({error:"Invalid signature"},{status:403});
 const now=new Date().toISOString(),answerType=voiceAnswerType(params.get("AnsweredBy"));
 if(!sid||!employeeId||!phone){
  console.info("Twilio voice staff leg rejected",{businessId:call.business_id,callId:call.id,legSid:sid||null,employeeId:employeeId||null,answerType,rawAnsweredBy:params.get("AnsweredBy")??null,reason:"missing_required_parameters",hasChildCallSid:Boolean(sid),hasEmployeeId:Boolean(employeeId),hasNormalizedPhone:Boolean(phone)});
  return hangup();
 }
 const leg={business_id:call.business_id,call_id:call.id,twilio_call_sid:sid,employee_id:employeeId,phone_e164:phone,status:"in_progress",answer_type:answerType,answered_at:now,machine_detected_at:answerType==="machine"?now:null,updated_at:now};
 await db.from("voice_call_legs").upsert(leg,{onConflict:"twilio_call_sid"});
 const {data:accepted}=await db.from("voice_calls").update({human_answered:true,was_missed:false,status:"in_progress",answered_at:now,answered_by_employee_id:employeeId,updated_at:now}).eq("id",call.id).eq("human_answered",false).eq("was_missed",false).select("id").maybeSingle();
 if(!accepted){
  console.info("Twilio voice human leg not bridged",{businessId:call.business_id,callId:call.id,legSid:sid,employeeId,reason:"already_resolved"});
  return hangup();
 }
 console.info("Twilio staff leg answered",{businessId:call.business_id,parentCallSid:parent,childCallSid:sid,employeeId,answeredBy:params.get("AnsweredBy")??null,amdAnswerType:answerType,action:"bridge"});
 return continueDial();
}
