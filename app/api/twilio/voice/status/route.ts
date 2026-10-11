import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {validTwilioSignature} from "@/lib/twilioWebhook";

export const runtime="nodejs";
const ok=()=>new Response(null,{status:200});
const normalizeStatus=(value:string|null)=>(value??"initiated").replace(/-/g,"_");

/**
 * Legacy outbound-call status callback only. Inbound routing now uses
 * leg-status, dial-complete, and voicemail-complete so this endpoint can
 * never influence the original inbound caller's TwiML.
 */
export async function POST(request:Request){
 try{
  const params=new URLSearchParams(await request.text()),sid=params.get("CallSid")??"",accountSid=params.get("AccountSid")??"",status=normalizeStatus(params.get("CallStatus")),db=getSupabaseAdmin();
  if(!db||!sid)return ok();
  const {data:call,error:callError}=await db.from("voice_calls").select("id,business_id,direction").eq("twilio_call_sid",sid).maybeSingle();
  if(callError||!call||call.direction!=="outbound"){console.info("Twilio voice legacy status ignored",{callSid:sid,reason:callError?.message??"not_outbound"});return ok();}
  const {data:account}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",call.business_id).eq("twilio_subaccount_sid",accountSid).maybeSingle();
  const token=account?.twilio_subaccount_sid?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:call.business_id,subaccountSid:account.twilio_subaccount_sid}):null;
  if(!token||!validTwilioSignature(request.url,params,request.headers.get("x-twilio-signature")??"",token)){console.error("Twilio voice legacy status signature rejected",{businessId:call.business_id,callSid:sid,accountSid});return ok();}
  const terminal=new Set(["completed","busy","no_answer","failed","canceled"]),now=new Date().toISOString();
  const {error}=await db.from("voice_calls").update({status,ended_at:terminal.has(status)?now:null,duration_seconds:Number(params.get("CallDuration")||0)||null,updated_at:now}).eq("id",call.id);
  if(error)console.error("Twilio voice legacy status persistence failed",{businessId:call.business_id,callSid:sid,error:error.message});
  console.info("Twilio voice legacy outbound status",{businessId:call.business_id,callSid:sid,callStatus:status});
  return ok();
 }catch(error){console.error("Twilio voice legacy status failed",{error:error instanceof Error?error.message:"unknown"});return ok();}
}
