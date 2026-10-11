import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {normalizeVoicePhone,voiceAnswerType} from "@/lib/twilio/voice";
import {validTwilioSignature} from "@/lib/twilioWebhook";

export const runtime="nodejs";
const ok=()=>new Response(null,{status:200});
const normalizeStatus=(value:string|null)=>(value??"initiated").replace(/-/g,"_");

/** Child Number.statusCallback only. It never supplies TwiML for the caller. */
export async function POST(request:Request){
 try{
  const params=new URLSearchParams(await request.text()),url=new URL(request.url),parent=url.searchParams.get("parent")??params.get("ParentCallSid")??"",employeeId=url.searchParams.get("employee")??"",businessId=url.searchParams.get("business")??"",childSid=params.get("CallSid")??"",accountSid=params.get("AccountSid")??"",status=normalizeStatus(params.get("CallStatus")),phone=normalizeVoicePhone(params.get("To")??"");
  const db=getSupabaseAdmin();if(!db)return ok();
  const {data:call,error:callError}=await db.from("voice_calls").select("id,business_id").eq("twilio_call_sid",parent).eq("business_id",businessId).maybeSingle();
  if(callError||!call){console.error("Twilio voice leg status unresolved",{parentCallSid:parent,childCallSid:childSid,employeeId,businessId,reason:callError?.message??"call_not_found"});return ok();}
  const {data:account,error:accountError}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",call.business_id).eq("twilio_subaccount_sid",accountSid).maybeSingle();
  const token=account?.twilio_subaccount_sid?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:call.business_id,subaccountSid:account.twilio_subaccount_sid}):null;
  const signatureValid=Boolean(token&&validTwilioSignature(request.url,params,request.headers.get("x-twilio-signature")??"",token));
  if(!signatureValid){console.error("Twilio voice leg status signature rejected",{businessId:call.business_id,parentCallSid:parent,childCallSid:childSid,employeeId,accountSid,accountError:accountError?.message??null});return ok();}
  if(childSid&&employeeId&&phone){
   const answerType=voiceAnswerType(params.get("AnsweredBy")),now=new Date().toISOString(),terminal=new Set(["completed","busy","no_answer","failed","canceled"]),leg:Record<string,unknown>={business_id:call.business_id,call_id:call.id,twilio_call_sid:childSid,employee_id:employeeId,phone_e164:phone,status,ended_at:terminal.has(status)?now:null,duration_seconds:Number(params.get("CallDuration")||0)||null,updated_at:now};
   if(answerType!=="unknown")leg.answer_type=answerType;
   if(answerType==="human")leg.answered_at=now;
   if(answerType==="machine")leg.machine_detected_at=now;
   const {error}=await db.from("voice_call_legs").upsert(leg,{onConflict:"twilio_call_sid"});
   if(error)console.error("Twilio voice leg status persistence failed",{businessId:call.business_id,parentCallSid:parent,childCallSid:childSid,employeeId,error:error.message});
  }
  console.info("Twilio voice leg status",{businessId:call.business_id,parentCallSid:parent,childCallSid:childSid,employeeId,callStatus:status});
  return ok();
 }catch(error){console.error("Twilio voice leg status failed",{error:error instanceof Error?error.message:"unknown"});return ok();}
}
