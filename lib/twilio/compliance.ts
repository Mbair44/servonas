import { getSupabaseAdmin } from "../supabaseAdmin.ts";
import { getBusinessTwilioContext } from "./businessTwilioProvider.ts";
import { formRequest, getParentTwilioHttpClient, type TwilioHttpClient } from "./twilioHttp.ts";

export type ComplianceStatus = "draft"|"pending_review"|"in_review"|"approved"|"rejected"|"failed"|"suspended";
export type BusinessComplianceInput = {
  authorizedRepresentative: { firstName:string; lastName:string; email:string; phone:string; businessTitle:string; jobPosition:string };
  business: {
    legalName:string; customerType:string; registrationIdType:string;
    registrationIdNumber:string; industry:string; companyType:string;
    websiteUrl:string; regionsOfOperation:string[];
    address:{ street:string; streetSecondary?:string; city:string; region:string; postalCode:string; country:string };
  };
};
export type ComplianceRegistration = {
  id:string; businessId:string; twilioCustomerProfileSid:string|null;
  status:ComplianceStatus; statusReason:string|null; errorCode:string|null;
  errorMessage:string|null; lastSyncedAt:string|null;
};
type Row = {
  id:string; business_id:string; business_twilio_account_id:string; twilio_customer_profile_sid:string|null;
  twilio_end_user_sid:string|null; registration_type:string; status:ComplianceStatus; status_reason:string|null;
  twilio_error_code:string|null; twilio_error_message_sanitized:string|null; last_synced_at:string|null;
};
type TwilioProfile = { sid:string; status:string; status_callback?:string; valid_until?:string; date_updated?:string };

export type ComplianceProvider = {
  getProfile(sid:string):Promise<TwilioProfile>;
  createDraft(input:{ friendlyName:string; email:string; policySid:string; statusCallback:string }):Promise<TwilioProfile>;
};
export type ComplianceRepository = {
  get(businessId:string):Promise<Row|null>;
  insert(values:Record<string,unknown>):Promise<Row|null>;
  update(id:string, values:Record<string,unknown>):Promise<Row>;
};

const mapStatus = (status:string):ComplianceStatus => ({
  draft:"draft", pending_review:"pending_review", in_review:"in_review", twilio_approved:"approved", "twilio-approved":"approved",
  approved:"approved", twilio_rejected:"rejected", "twilio-rejected":"rejected", rejected:"rejected", suspended:"suspended",
}[status.toLowerCase()] as ComplianceStatus|undefined) ?? "failed";
const context = (row:Row):ComplianceRegistration => ({ id:row.id,businessId:row.business_id,
  twilioCustomerProfileSid:row.twilio_customer_profile_sid,status:row.status,statusReason:row.status_reason,
  errorCode:row.twilio_error_code,errorMessage:row.twilio_error_message_sanitized,lastSyncedAt:row.last_synced_at });
const safeError = "Twilio compliance operation failed and can be retried.";

export function getTwilioComplianceProvider(http:TwilioHttpClient=getParentTwilioHttpClient()):ComplianceProvider {
  return {
    getProfile:(sid)=>http.request(`https://trusthub.twilio.com/v1/CustomerProfiles/${encodeURIComponent(sid)}`),
    createDraft:(input)=>http.request("https://trusthub.twilio.com/v1/CustomerProfiles",formRequest({
      FriendlyName:input.friendlyName,Email:input.email,PolicySid:input.policySid,StatusCallback:input.statusCallback,
    })),
  };
}

function repository():ComplianceRepository {
  const db=getSupabaseAdmin(); if(!db) throw new Error("Server-side compliance storage is unavailable.");
  const fields="id,business_id,business_twilio_account_id,twilio_customer_profile_sid,twilio_end_user_sid,registration_type,status,status_reason,twilio_error_code,twilio_error_message_sanitized,last_synced_at";
  return {
    async get(businessId){const {data,error}=await db.from("twilio_compliance_registrations").select(fields).eq("business_id",businessId).eq("registration_type","secondary_customer_profile").maybeSingle();if(error)throw new Error("Compliance lookup failed.");return data as Row|null;},
    async insert(values){const {data,error}=await db.from("twilio_compliance_registrations").insert(values).select(fields).single();if(error?.code==="23505")return null;if(error)throw new Error("Compliance state could not be created.");return data as Row;},
    async update(id,values){const {data,error}=await db.from("twilio_compliance_registrations").update({...values,updated_at:new Date().toISOString()}).eq("id",id).select(fields).single();if(error)throw new Error("Compliance state could not be updated.");return data as Row;},
  };
}

export function createComplianceService(deps:{repository:ComplianceRepository;provider:ComplianceProvider;getAccount:typeof getBusinessTwilioContext}) {
  const getBusinessComplianceStatus=async(businessId:string)=>{const row=await deps.repository.get(businessId);return row?context(row):null;};
  const syncBusinessComplianceStatus=async(businessId:string)=>{
    const row=await deps.repository.get(businessId); if(!row?.twilio_customer_profile_sid)return row?context(row):null;
    try { const remote=await deps.provider.getProfile(row.twilio_customer_profile_sid); const now=new Date().toISOString(); const status=mapStatus(remote.status);
      return context(await deps.repository.update(row.id,{status,last_synced_at:now,approved_at:status==="approved"?now:null,rejected_at:status==="rejected"?now:null,twilio_error_code:null,twilio_error_message_sanitized:null}));
    } catch { await deps.repository.update(row.id,{status:"failed",twilio_error_message_sanitized:safeError,last_synced_at:new Date().toISOString()}); throw new Error(safeError); }
  };
  const createBusinessComplianceRegistration=async(businessId:string,input:BusinessComplianceInput)=>{
    const account=await deps.getAccount(businessId); if(!account?.subaccountSid||account.provisioningStatus!=="active")throw new Error("The business needs an active Twilio subaccount first.");
    const policySid=process.env.TWILIO_SECONDARY_CUSTOMER_PROFILE_POLICY_SID?.trim();
    if(!policySid)throw new Error("Secondary Customer Profile policy configuration is not ready.");
    let row=await deps.repository.get(businessId); if(row?.twilio_customer_profile_sid)return context(row);
    row=row??await deps.repository.insert({business_id:businessId,business_twilio_account_id:account.id,registration_type:"secondary_customer_profile",status:"draft"})??await deps.repository.get(businessId);
    if(!row)throw new Error("Compliance state could not be claimed.");
    // Trust Hub Secondary Customer Profiles are parent-owned so they can reference
    // Servonas's approved parent Primary Customer Profile. Tenant phone numbers remain
    // subaccount-owned. Sensitive registrationIdNumber is deliberately neither logged
    // nor persisted here. End-user/supporting-document creation must be added only after
    // Twilio approves the Servonas primary profile and confirms the required policy fields.
    const profile=await deps.provider.createDraft({friendlyName:`Servonas end business ${businessId}`,email:input.authorizedRepresentative.email,policySid,statusCallback:`${process.env.NEXT_PUBLIC_SITE_URL??"https://servonas.com"}/api/twilio/compliance-status`});
    return context(await deps.repository.update(row.id,{twilio_customer_profile_sid:profile.sid,status:mapStatus(profile.status),last_synced_at:new Date().toISOString()}));
  };
  return {getBusinessComplianceStatus,syncBusinessComplianceStatus,createBusinessComplianceRegistration,
    async getOrCreateBusinessComplianceRegistration(businessId:string,input:BusinessComplianceInput){return await getBusinessComplianceStatus(businessId)??createBusinessComplianceRegistration(businessId,input);}};
}

const service=()=>createComplianceService({repository:repository(),provider:getTwilioComplianceProvider(),getAccount:getBusinessTwilioContext});
export const getBusinessComplianceStatus=(businessId:string)=>service().getBusinessComplianceStatus(businessId);
export const syncBusinessComplianceStatus=(businessId:string)=>service().syncBusinessComplianceStatus(businessId);
export const createBusinessComplianceRegistration=(businessId:string,input:BusinessComplianceInput)=>service().createBusinessComplianceRegistration(businessId,input);
export const getOrCreateBusinessComplianceRegistration=(businessId:string,input:BusinessComplianceInput)=>service().getOrCreateBusinessComplianceRegistration(businessId,input);
