import {getSupabaseAdmin} from "../supabaseAdmin.ts";
import {getTwilioCredentials} from "../communications/twilioCredentials.ts";
import {getSubaccountWebhookSecretResolver} from "./subaccountWebhookSecrets.ts";

export type OutboundSender={configured:boolean;accountSid:string|null;username:string|null;password:string|null;from:string|null;messagingServiceSid:string|null;mode:"legacy"|"messaging_service"};

export async function resolveTenantOutboundSender(businessId:string):Promise<OutboundSender>{
 const legacy=getTwilioCredentials(),fallback:OutboundSender={configured:legacy.configured,accountSid:legacy.accountSid??null,username:legacy.username??null,password:legacy.password??null,from:legacy.from??null,messagingServiceSid:null,mode:"legacy"};
 const db=getSupabaseAdmin();if(!db)return fallback;
 const {data}=await db.from("twilio_tenant_activations").select("status,outbound_sender_mode,messaging_service_sid,business_twilio_accounts(twilio_subaccount_sid,webhook_secret_status)").eq("business_id",businessId).maybeSingle();
 if(data?.status!=="active"||data.outbound_sender_mode!=="messaging_service"||!data.messaging_service_sid)return fallback;
 const account=Array.isArray(data.business_twilio_accounts)?data.business_twilio_accounts[0]:data.business_twilio_accounts;
 if(!account?.twilio_subaccount_sid||account.webhook_secret_status!=="available")return fallback;
 const token=await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId,subaccountSid:account.twilio_subaccount_sid});
 if(!token)return fallback;
 return{configured:true,accountSid:account.twilio_subaccount_sid,username:account.twilio_subaccount_sid,password:token,from:null,messagingServiceSid:data.messaging_service_sid,mode:"messaging_service"};
}
