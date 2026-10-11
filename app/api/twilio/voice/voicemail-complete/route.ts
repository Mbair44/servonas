import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";
import {validTwilioSignature} from "@/lib/twilioWebhook";

export const runtime="nodejs";
const done=()=>new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',{status:200,headers:{"Content-Type":"text/xml; charset=utf-8"}});

/** Record.action and recordingStatusCallback endpoint. It ends the parent call cleanly. */
export async function POST(request:Request){
 try{
  const params=new URLSearchParams(await request.text()),url=new URL(request.url),parent=url.searchParams.get("parent")??params.get("CallSid")??"",businessId=url.searchParams.get("business")??"",accountSid=params.get("AccountSid")??"",recordingSid=params.get("RecordingSid"),recordingStatus=params.get("RecordingStatus"),recordingUrl=params.get("RecordingUrl"),db=getSupabaseAdmin();
  if(!db)return done();
  const {data:call,error:callError}=await db.from("voice_calls").select("id,business_id,metadata").eq("twilio_call_sid",parent).eq("business_id",businessId).maybeSingle();
  if(callError||!call){console.error("Twilio voicemail completed unresolved",{parentCallSid:parent,businessId,reason:callError?.message??"call_not_found"});return done();}
  const {data:account}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",call.business_id).eq("twilio_subaccount_sid",accountSid).maybeSingle();
  const token=account?.twilio_subaccount_sid?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:call.business_id,subaccountSid:account.twilio_subaccount_sid}):null;
  if(!token||!validTwilioSignature(request.url,params,request.headers.get("x-twilio-signature")??"",token)){console.error("Twilio voicemail completed signature rejected",{businessId:call.business_id,parentCallSid:parent,recordingSid:recordingSid??null});return done();}
  const metadata={...((call.metadata&&typeof call.metadata==="object")?call.metadata:{}),voicemail_recording_url:recordingUrl??null};
  const {error}=await db.from("voice_calls").update({recording_sid:recordingSid||undefined,recording_status:recordingStatus||"completed",recording_duration_seconds:Number(params.get("RecordingDuration")||0)||null,metadata,updated_at:new Date().toISOString()}).eq("id",call.id);
  if(error)console.error("Twilio voicemail completed persistence failed",{businessId:call.business_id,parentCallSid:parent,recordingSid:recordingSid??null,error:error.message});
  console.info("Twilio voicemail completed",{businessId:call.business_id,parentCallSid:parent,recordingSid:recordingSid??null,recordingStatus:recordingStatus??null});
  return done();
 }catch(error){console.error("Twilio voicemail completed failed",{error:error instanceof Error?error.message:"unknown"});return done();}
}
