import {getSupabaseAdmin} from "../supabaseAdmin.ts";
import {getSubaccountWebhookSecretResolver} from "./subaccountWebhookSecrets.ts";
import {isBusinessTwilioEnabled} from "./access.ts";

export type OutboundSender={configured:boolean;accountSid:string|null;username:string|null;password:string|null;from:string|null;messagingServiceSid:string|null;mode:"legacy"|"messaging_service"};

export async function resolveTenantOutboundSender(businessId:string):Promise<OutboundSender>{
 const fallback:OutboundSender={configured:false,accountSid:null,username:null,password:null,from:null,messagingServiceSid:null,mode:"messaging_service"};
 if(!await isBusinessTwilioEnabled(businessId))return fallback;
 const db=getSupabaseAdmin();if(!db)return fallback;
 const {data}=await db.from("twilio_tenant_activations").select("status,outbound_sender_mode,messaging_service_sid,phone_number_sid,business_twilio_accounts(id,business_id,provisioning_status,twilio_subaccount_sid,webhook_secret_status)").eq("business_id",businessId).maybeSingle();
 if(data?.status!=="active"||data.outbound_sender_mode!=="messaging_service"||!data.messaging_service_sid)return fallback;
 const account=Array.isArray(data.business_twilio_accounts)?data.business_twilio_accounts[0]:data.business_twilio_accounts;
 if(!account?.twilio_subaccount_sid||account.business_id!==businessId||account.provisioning_status!=="active"||account.webhook_secret_status!=="available")return fallback;
 const {data:phone,error:phoneError}=await db.from("twilio_phone_numbers").select("phone_number_e164").eq("business_id",businessId).eq("business_twilio_account_id",account.id).eq("twilio_phone_number_sid",data.phone_number_sid).eq("status","active").eq("provisioning_status","active").maybeSingle();
 if(phoneError||!phone?.phone_number_e164)return fallback;
 const token=await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId,subaccountSid:account.twilio_subaccount_sid});
 if(!token)return fallback;
 return{configured:true,accountSid:account.twilio_subaccount_sid,username:account.twilio_subaccount_sid,password:token,from:phone.phone_number_e164,messagingServiceSid:data.messaging_service_sid,mode:"messaging_service"};
}
