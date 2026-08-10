import { getSupabaseAdmin } from "../supabaseAdmin.ts";
import { getBusinessTwilioContext } from "./businessTwilioProvider.ts";
import { getBusinessComplianceStatus } from "./compliance.ts";
import { formRequest, getSubaccountTwilioHttpClient } from "./twilioHttp.ts";
import {getSubaccountWebhookSecretResolver,type SubaccountWebhookSecretResolver} from "./subaccountWebhookSecrets.ts";

export type NumberCapabilities={sms:boolean;mms:boolean;voice:boolean};
export type AvailablePhoneNumber={phoneNumber:string;friendlyName:string|null;locality:string|null;region:string|null;postalCode:string|null;capabilities:NumberCapabilities;monthlyCost:string|null};
type ProviderNumber={sid?:string;phone_number:string;friendly_name?:string;locality?:string;region?:string;postal_code?:string;capabilities?:{SMS?:boolean;MMS?:boolean;voice?:boolean};beta?:boolean};
type StoredNumber={id:string;business_id:string;business_twilio_account_id:string;twilio_phone_number_sid:string|null;phone_number_e164:string;provisioning_status:string;status:string};
export type PhoneNumberRepository={getPrimary(businessId:string):Promise<StoredNumber|null>;getByNumber(businessId:string,number:string):Promise<StoredNumber|null>;claim(values:Record<string,unknown>):Promise<StoredNumber|null>;mark(id:string,values:Record<string,unknown>):Promise<StoredNumber>};
export type PhoneNumberProvider={search(accountSid:string,authToken:string,areaCode:string,capabilities:NumberCapabilities):Promise<AvailablePhoneNumber[]>;findOwned(accountSid:string,authToken:string,phone:string):Promise<ProviderNumber|null>;purchase(accountSid:string,authToken:string,phone:string,friendlyName:string):Promise<ProviderNumber>};

export function getTwilioPhoneNumberProvider():PhoneNumberProvider{
 const base=(sid:string)=>`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}`;
 const convert=(n:ProviderNumber):AvailablePhoneNumber=>({phoneNumber:n.phone_number,friendlyName:n.friendly_name??null,locality:n.locality??null,region:n.region??null,postalCode:n.postal_code??null,capabilities:{sms:Boolean(n.capabilities?.SMS),mms:Boolean(n.capabilities?.MMS),voice:Boolean(n.capabilities?.voice)},monthlyCost:null});
 return {
  async search(sid,token,area,caps){const q=new URLSearchParams({AreaCode:area,SmsEnabled:"true",PageSize:"20"});if(caps.mms)q.set("MmsEnabled","true");if(caps.voice)q.set("VoiceEnabled","true");const v=await getSubaccountTwilioHttpClient(sid,token).request<{available_phone_numbers?:ProviderNumber[]}>(`${base(sid)}/AvailablePhoneNumbers/US/Local.json?${q}`);return (v.available_phone_numbers??[]).map(convert);},
  async findOwned(sid,token,phone){const q=new URLSearchParams({PhoneNumber:phone,PageSize:"20"});const v=await getSubaccountTwilioHttpClient(sid,token).request<{incoming_phone_numbers?:ProviderNumber[]}>(`${base(sid)}/IncomingPhoneNumbers.json?${q}`);return v.incoming_phone_numbers?.find(n=>n.phone_number===phone)??null;},
  purchase:(sid,token,phone,name)=>getSubaccountTwilioHttpClient(sid,token).request(`${base(sid)}/IncomingPhoneNumbers.json`,formRequest({PhoneNumber:phone,FriendlyName:name,SmsUrl:`${process.env.NEXT_PUBLIC_SITE_URL??"https://servonas.com"}/api/twilio/inbound`,SmsMethod:"POST"})),
 };
}

function repository():PhoneNumberRepository{const db=getSupabaseAdmin();if(!db)throw new Error("Server-side phone-number storage is unavailable.");const fields="id,business_id,business_twilio_account_id,twilio_phone_number_sid,phone_number_e164,provisioning_status,status";return{
 async getPrimary(b){const {data,error}=await db.from("twilio_phone_numbers").select(fields).eq("business_id",b).eq("is_primary",true).eq("status","active").maybeSingle();if(error)throw new Error("Phone-number lookup failed.");return data as StoredNumber|null;},
 async getByNumber(b,n){const {data,error}=await db.from("twilio_phone_numbers").select(fields).eq("business_id",b).eq("phone_number_e164",n).maybeSingle();if(error)throw new Error("Phone-number lookup failed.");return data as StoredNumber|null;},
 async claim(v){const {data,error}=await db.from("twilio_phone_numbers").insert(v).select(fields).single();if(error?.code==="23505")return null;if(error)throw new Error("Phone-number purchase state could not be created.");return data as StoredNumber;},
 async mark(id,v){const {data,error}=await db.from("twilio_phone_numbers").update({...v,updated_at:new Date().toISOString()}).eq("id",id).select(fields).single();if(error)throw new Error("Phone-number state could not be updated.");return data as StoredNumber;}
};}

const e164=(value:string)=>/^\+[1-9]\d{7,14}$/.test(value);
export function createPhoneNumberService(deps:{repository:PhoneNumberRepository;provider:PhoneNumberProvider;getAccount:typeof getBusinessTwilioContext;getCompliance:typeof getBusinessComplianceStatus;secretStore:SubaccountWebhookSecretResolver}){
 const requireEligible=async(businessId:string)=>{const account=await deps.getAccount(businessId);if(!account?.subaccountSid||account.provisioningStatus!=="active")throw new Error("The business needs an active Twilio subaccount first.");const compliance=await deps.getCompliance(businessId);if(compliance?.status!=="approved")throw new Error("Twilio compliance must be approved before selecting a number.");const authToken=await deps.secretStore.getSubaccountAuthToken({businessId,subaccountSid:account.subaccountSid});if(!authToken)throw new Error("Secure Twilio webhook credentials are not ready.");return{account,authToken};};
 return {
  async searchBusinessPhoneNumbers(businessId:string,options:{areaCode:string;fallbackAreaCodes?:string[];mms?:boolean;voice?:boolean}){const {account,authToken}=await requireEligible(businessId);const areas=[options.areaCode,...(options.fallbackAreaCodes??[])].filter((v,i,a)=>/^\d{3}$/.test(v)&&a.indexOf(v)===i);if(!areas.length)throw new Error("A valid US area code is required.");const caps={sms:true,mms:Boolean(options.mms),voice:Boolean(options.voice)};for(const area of areas){const found=await deps.provider.search(account.subaccountSid!,authToken,area,caps);if(found.length)return found;}return[];},
  async purchaseBusinessPhoneNumber(businessId:string,phoneNumber:string,metadata?:Partial<AvailablePhoneNumber>){
   if(!e164(phoneNumber))throw new Error("A valid E.164 phone number is required.");const {account,authToken}=await requireEligible(businessId);const primary=await deps.repository.getPrimary(businessId);if(primary?.twilio_phone_number_sid)return primary;
   let row=await deps.repository.getByNumber(businessId,phoneNumber),claimed=false;if(!row){const inserted=await deps.repository.claim({business_id:businessId,business_twilio_account_id:account.id,phone_number_e164:phoneNumber,friendly_name:metadata?.friendlyName??`Servonas ${businessId}`,area_code:phoneNumber.startsWith("+1")?phoneNumber.slice(2,5):null,locality:metadata?.locality,region:metadata?.region,sms_capable:true,mms_capable:Boolean(metadata?.capabilities?.mms),voice_capable:Boolean(metadata?.capabilities?.voice),is_primary:true,status:"active",provisioning_status:"provisioning"});claimed=Boolean(inserted);row=inserted??await deps.repository.getByNumber(businessId,phoneNumber);}if(!row)throw new Error("Phone-number purchase state could not be claimed.");if(row.twilio_phone_number_sid)return row;if(!claimed&&row.provisioning_status==="provisioning")throw new Error("Phone-number purchase is already in progress. Retry shortly.");
   try{const owned=await deps.provider.findOwned(account.subaccountSid!,authToken,phoneNumber);const purchased=owned??await deps.provider.purchase(account.subaccountSid!,authToken,phoneNumber,metadata?.friendlyName??`Servonas ${businessId}`);if(!purchased.sid)throw new Error("Twilio returned no phone-number SID.");
    return deps.repository.mark(row.id,{twilio_phone_number_sid:purchased.sid,provisioning_status:"active",provisioning_error:null,inbound_sms_webhook_configured:true,last_synced_at:new Date().toISOString()});
   }catch{await deps.repository.mark(row.id,{provisioning_status:"failed",provisioning_error:"Twilio phone-number purchase failed and can be reconciled safely."});throw new Error("Twilio phone-number purchase failed and can be retried.");}
  }
 };
}
const service=()=>createPhoneNumberService({repository:repository(),provider:getTwilioPhoneNumberProvider(),getAccount:getBusinessTwilioContext,getCompliance:getBusinessComplianceStatus,secretStore:getSubaccountWebhookSecretResolver()});
export const searchBusinessPhoneNumbers=(businessId:string,options:{areaCode:string;fallbackAreaCodes?:string[];mms?:boolean;voice?:boolean})=>service().searchBusinessPhoneNumbers(businessId,options);
export const purchaseBusinessPhoneNumber=(businessId:string,phone:string,metadata?:Partial<AvailablePhoneNumber>)=>service().purchaseBusinessPhoneNumber(businessId,phone,metadata);
