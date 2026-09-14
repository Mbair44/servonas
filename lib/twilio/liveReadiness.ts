import {getSupabaseAdmin} from "../supabaseAdmin.ts";
import {getParentTwilioHttpClient,getSubaccountTwilioHttpClient,type TwilioHttpClient} from "./twilioHttp.ts";
import {getSubaccountWebhookSecretResolver} from "./subaccountWebhookSecrets.ts";
export type ReadinessState="not_connected"|"compliance_pending"|"number_required"|"ready"|"error";
export type LiveReadiness={state:ReadinessState;issues:string[];resources:Record<string,{sid:string;status:string}>;checkedAt:string};
export type Chain={parentSid:string;accountSid:string;brandSid:string;profileSid:string;trustSid:string;serviceSid:string;campaignSid:string;phoneSid:string;phone:string;inboundUrl:string;statusUrl:string};
type Resource={sid:string;account_sid?:string;status?:string;[key:string]:unknown};
export const campaignApproved=(value:unknown)=>String(value??"").toUpperCase()==="VERIFIED";
export function tenantWebhookUrls(){
 const inboundUrl=process.env.TWILIO_INBOUND_WEBHOOK_URL?.trim(),statusUrl=process.env.TWILIO_TENANT_MESSAGE_STATUS_WEBHOOK_URL?.trim();
 if(!inboundUrl||!statusUrl)throw new Error("Set the production inbound and delivery callback URLs.");
 const inbound=new URL(inboundUrl),status=new URL(statusUrl);
 if(inbound.protocol!=="https:"||status.protocol!=="https:"||inbound.origin!==status.origin||inbound.pathname!=="/api/twilio/inbound"||status.pathname!=="/api/twilio/tenant-message-status"||inbound.search||status.search)throw new Error("Configure canonical HTTPS Twilio webhook URLs on the same production origin.");
 return {inboundUrl,statusUrl};
}
/** GET-only verification. Never creates or replaces provider resources. */
export async function verifyTwilioChain(c:Chain,parent:TwilioHttpClient,tenant:TwilioHttpClient):Promise<LiveReadiness>{
 const result:LiveReadiness={state:"error",issues:[],resources:{},checkedAt:new Date().toISOString()};
 try{
  const base=`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}`;
  const entries=await Promise.all([
   tenant.request<Resource>(`${base}.json`),parent.request<Resource>(`https://messaging.twilio.com/v1/a2p/BrandRegistrations/${c.brandSid}`),
   tenant.request<Resource>(`https://messaging.twilio.com/v1/Services/${c.serviceSid}`),
   tenant.request<Resource>(`https://messaging.twilio.com/v1/Services/${c.serviceSid}/Compliance/Usa2p/${c.campaignSid}`),
   tenant.request<Resource>(`${base}/IncomingPhoneNumbers/${c.phoneSid}.json`),
   tenant.request<Resource>(`https://messaging.twilio.com/v1/Services/${c.serviceSid}/PhoneNumbers/${c.phoneSid}`)
  ]);
  const [account,brand,service,campaign,phone,pool]=entries;
  for(const [name,r] of entries.map((r,i)=>[["account","brand","service","campaign","number","sender_pool"][i],r] as const))result.resources[name]={sid:r.sid,status:String(name==="campaign"?r.campaign_status:r.status??"found")};
  const require=(condition:boolean,message:string)=>{if(!condition)result.issues.push(message);};
  require(account.sid===c.accountSid&&account.owner_account_sid===c.parentSid&&account.status==="active"&&c.parentSid!==c.accountSid,"Subaccount identity, parent ownership, or active status does not match.");
  require(brand.sid===c.brandSid&&brand.account_sid===c.parentSid&&brand.customer_profile_bundle_sid===c.profileSid&&brand.a2p_profile_bundle_sid===c.trustSid,"Brand ownership or tenant profile association does not match.");
  require(brand.mock!==true&&campaign.mock!==true,"Mock compliance resources cannot authorize production SMS.");
  require(service.sid===c.serviceSid&&service.account_sid===c.accountSid,"Messaging Service does not belong to this tenant account.");
  require(campaign.sid===c.campaignSid&&campaign.account_sid===c.accountSid&&campaign.messaging_service_sid===c.serviceSid&&campaign.brand_registration_sid===c.brandSid,"Campaign account, Messaging Service, or Brand does not match.");
  require(phone.sid===c.phoneSid&&phone.account_sid===c.accountSid&&phone.phone_number===c.phone,"Phone number ownership does not match.");
  require((phone.capabilities as {sms?:boolean}|undefined)?.sms===true,"Selected number is not SMS-capable.");
  require(pool.sid===c.phoneSid&&pool.account_sid===c.accountSid&&pool.service_sid===c.serviceSid&&pool.phone_number===c.phone,"Number is not attached to the expected sender pool.");
  const onNumber=service.use_inbound_webhook_on_number===true;
  require((onNumber?phone.sms_url:service.inbound_request_url)===c.inboundUrl&&String(onNumber?phone.sms_method:service.inbound_method).toUpperCase()==="POST","Effective inbound webhook must use the canonical Servonas URL and POST.");
  require(service.status_callback===c.statusUrl,"Messaging Service delivery callback must use the canonical Servonas URL.");
  if(result.issues.length)return result;
  if(String(brand.status).toUpperCase()!=="APPROVED"||!campaignApproved(campaign.campaign_status)){
   result.state=[brand.status,campaign.campaign_status].some(v=>["FAILED","REJECTED","SUSPENDED"].includes(String(v).toUpperCase()))?"error":"compliance_pending";
   result.issues.push("Brand must be APPROVED and campaign must be VERIFIED.");return result;
  }
  result.state="ready";return result;
 }catch(error){result.issues.push(error instanceof Error?error.message:"Live Twilio verification failed.");return result;}
}
export async function verifyTenantReadiness(businessId:string):Promise<LiveReadiness>{
 const fail=(state:ReadinessState,message:string):LiveReadiness=>({state,issues:[message],resources:{},checkedAt:new Date().toISOString()});
 try{
  const db=getSupabaseAdmin();if(!db)return fail("error","Production database configuration is unavailable.");
  const [account,activation,phone,compliance,access]=await Promise.all([
   db.from("business_twilio_accounts").select("id,twilio_subaccount_sid,provisioning_status,webhook_secret_status").eq("business_id",businessId).maybeSingle(),
   db.from("twilio_tenant_activations").select("business_twilio_account_id,brand_registration_sid,campaign_sid,messaging_service_sid,phone_number_sid").eq("business_id",businessId).maybeSingle(),
   db.from("twilio_phone_numbers").select("business_twilio_account_id,twilio_phone_number_sid,phone_number_e164,provisioning_status").eq("business_id",businessId).eq("status","active").eq("is_primary",true).maybeSingle(),
   db.from("twilio_compliance_registrations").select("business_twilio_account_id,twilio_brand_sid,twilio_customer_profile_sid,twilio_trust_product_sid").eq("business_id",businessId).eq("registration_type","secondary_customer_profile").maybeSingle(),
   db.from("business_twilio_access").select("enabled").eq("business_id",businessId).maybeSingle()
  ]);
  if([account,activation,phone,compliance,access].some(r=>r.error))return fail("error","Tenant Twilio records could not be read. Check migrations and configuration.");
  const a=account.data,v=activation.data,p=phone.data,c=compliance.data;
  if(!access.data?.enabled||!a?.twilio_subaccount_sid)return fail("not_connected","Tenant Twilio access and an existing subaccount are required.");
  if(a.provisioning_status!=="active"||a.webhook_secret_status!=="available")return fail("error","Subaccount or Vault credential is not active.");
  if(!v?.brand_registration_sid||!v?.campaign_sid||!v.messaging_service_sid||!c?.twilio_customer_profile_sid||!c.twilio_trust_product_sid)return fail("compliance_pending","Link the existing approved Brand, profile, Trust Product, campaign and Messaging Service. No replacements were created.");
  if(!p?.twilio_phone_number_sid||p.provisioning_status!=="active")return fail("number_required","An existing active tenant number must be selected.");
  if(v.business_twilio_account_id!==a.id||p.business_twilio_account_id!==a.id||c.business_twilio_account_id!==a.id||v.phone_number_sid!==p.twilio_phone_number_sid)return fail("error","Tenant resource associations are inconsistent.");
  const token=await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId,subaccountSid:a.twilio_subaccount_sid});
  if(!token)return fail("error","Tenant Vault credential could not be retrieved.");
  const parentSid=process.env.TWILIO_ACCOUNT_SID?.trim();if(!parentSid)return fail("error","Parent account configuration is missing.");
  return verifyTwilioChain({parentSid,accountSid:a.twilio_subaccount_sid,brandSid:v.brand_registration_sid,profileSid:c.twilio_customer_profile_sid,trustSid:c.twilio_trust_product_sid,serviceSid:v.messaging_service_sid,campaignSid:v.campaign_sid,phoneSid:p.twilio_phone_number_sid,phone:p.phone_number_e164,...tenantWebhookUrls()},getParentTwilioHttpClient(),getSubaccountTwilioHttpClient(a.twilio_subaccount_sid,token));
 }catch(error){return fail("error",error instanceof Error?error.message:"Live verification failed.");}
}
