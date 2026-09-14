import {getSupabaseAdmin} from "../supabaseAdmin.ts";
import {syncPhase3} from "./phase3Activation.ts";
import {sendTenantTwilioMessage,TenantSmsError} from "./messageUsage.ts";
export async function smsTestBusiness(){
 const db=getSupabaseAdmin(),id=process.env.TWILIO_SMS_TEST_BUSINESS_ID;
 if(!db||!id)throw new Error("Configure the Copper State Bounce SMS test tenant in production.");
 const {data,error}=await db.from("businesses").select("id,name,slug").eq("id",id).eq("is_deleted",false).single();
 // Pilot-only restriction; the underlying transport remains tenant-generic.
 if(error||!data||data.name.trim().toLowerCase()!=="copper state bounce")throw new Error("The SMS pilot is restricted to Copper State Bounce. Verify the configured business ID.");
 return data;
}
export function smsTestLiveEnabled(){return process.env.TWILIO_SMS_TEST_LIVE_ENABLED==="true"&&(process.env.VERCEL_ENV==="production"||(!process.env.VERCEL_ENV&&process.env.NODE_ENV==="production"));}
export async function sendPilotSms(input:{requestKey:string;to:string;consent:boolean},actorUserId:string){
 const business=await smsTestBusiness(),db=getSupabaseAdmin()!;
 if(!smsTestLiveEnabled())throw new Error("Live pilot sending is disabled for this environment.");
 if(!input.consent)throw new Error("Confirm the test recipient has agreed to receive this message.");
 if(!/^\+1[2-9]\d{9}$/.test(input.to)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.requestKey))throw new Error("Enter a US destination in +1XXXXXXXXXX format.");
 const {data:existing,error:lookupError}=await db.from("twilio_tenant_activation_events").select("id,to_status,metadata").eq("business_id",business.id).eq("request_key",input.requestKey).maybeSingle();
 if(lookupError)throw new Error("Test request storage is unavailable. Apply the SMS pilot migration.");
 if(existing)return existing;
 const readiness=await syncPhase3(business.id,actorUserId);if(readiness.state!=="ready")throw new Error(`${readiness.state}: ${readiness.issues.join(" ")}`);
 const {data:activation,error}=await db.from("twilio_tenant_activations").select("id").eq("business_id",business.id).single();if(error||!activation)throw new Error("Activation record is missing.");
 const body=`${business.name}: This is your requested Servonas SMS test. Please reply TEST RECEIVED. Reply STOP to opt out.`;
 const metadata={to:input.to,body,consentConfirmedAt:new Date().toISOString()};
 const claim=await db.from("twilio_tenant_activation_events").insert({activation_id:activation.id,business_id:business.id,event_type:"sms_test",to_status:"sending",step:"complete",actor_user_id:actorUserId,request_key:input.requestKey,metadata}).select("id").single();
 if(claim.error){if(claim.error.code==="23505")return {to_status:"already_requested",metadata:{}};throw new Error("Could not safely claim this test. No message was sent.");}
 // Never retry an uncertain send automatically. The durable request claim survives crashes.
 let sid:string|null=null;
 try{
  sid=(await sendTenantTwilioMessage({businessId:business.id,to:input.to,body,sourceType:"sms_test",sourceId:String(claim.data.id)})).sid;
  const {error:saveError}=await db.from("twilio_tenant_activation_events").update({to_status:"accepted",metadata:{...metadata,messageSid:sid}}).eq("id",claim.data.id).eq("business_id",business.id);
  if(saveError)throw new TenantSmsError("Twilio accepted the message but the request status could not be saved. Do not resend.",null,sid);
  return {to_status:"accepted",metadata:{messageSid:sid}};
 }catch(error){
  const provider=error instanceof TenantSmsError?error:null,message=provider?.message??"Send outcome is unknown. Inspect Twilio logs before starting another test.";
  const status=provider?.code?"failed":"unknown";
  await db.from("twilio_tenant_activation_events").update({to_status:status,metadata:{...metadata,messageSid:provider?.messageSid??sid,errorCode:provider?.code??null,error:message}}).eq("id",claim.data.id).eq("business_id",business.id);
  return {to_status:status,metadata:{messageSid:provider?.messageSid??sid,errorCode:provider?.code??null,error:message}};
 }
}
