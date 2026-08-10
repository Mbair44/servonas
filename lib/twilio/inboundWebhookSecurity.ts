import {getSupabaseAdmin} from "../supabaseAdmin.ts";
import {getSubaccountWebhookSecretResolver,type SubaccountWebhookSecretResolver} from "./subaccountWebhookSecrets.ts";

export type InboundNumberMapping={businessId:string;subaccountSid:string};
export type InboundNumberMappingRepository={find(accountSid:string,to:string):Promise<InboundNumberMapping|null>};
export type InboundWebhookSecurity={mode:"legacy_parent"|"tenant";businessId:string|null;token:string};

export async function resolveInboundWebhookSecurity(input:{accountSid:string;to:string;parentAccountSid:string|null;parentAuthToken:string|null},deps:{mappings:InboundNumberMappingRepository;secrets:SubaccountWebhookSecretResolver}):Promise<InboundWebhookSecurity|null>{
 if(!input.accountSid||input.accountSid===input.parentAccountSid)return input.parentAuthToken?{mode:"legacy_parent",businessId:null,token:input.parentAuthToken}:null;
 const mapping=await deps.mappings.find(input.accountSid,input.to);if(!mapping||mapping.subaccountSid!==input.accountSid)return null;
 const token=await deps.secrets.getSubaccountAuthToken({businessId:mapping.businessId,subaccountSid:mapping.subaccountSid});
 return token?{mode:"tenant",businessId:mapping.businessId,token}:null;
}

export function getInboundNumberMappingRepository():InboundNumberMappingRepository{
 const db=getSupabaseAdmin();if(!db)throw new Error("Inbound number mapping storage is unavailable.");
 return{async find(accountSid,to){const {data,error}=await db.from("twilio_phone_numbers").select("business_id,business_twilio_accounts!inner(twilio_subaccount_sid)").eq("phone_number_e164",to).eq("status","active").maybeSingle();if(error||!data)return null;const row=data as {business_id:string;business_twilio_accounts:{twilio_subaccount_sid:string}|{twilio_subaccount_sid:string}[]},linked=Array.isArray(row.business_twilio_accounts)?row.business_twilio_accounts[0]:row.business_twilio_accounts;return linked?.twilio_subaccount_sid===accountSid?{businessId:row.business_id,subaccountSid:linked.twilio_subaccount_sid}:null;}};
}

export const resolveConfiguredInboundWebhookSecurity=(accountSid:string,to:string)=>resolveInboundWebhookSecurity({accountSid,to,parentAccountSid:process.env.TWILIO_ACCOUNT_SID??null,parentAuthToken:process.env.TWILIO_AUTH_TOKEN??null},{mappings:getInboundNumberMappingRepository(),secrets:getSubaccountWebhookSecretResolver()});
