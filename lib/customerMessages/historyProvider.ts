import type {SupabaseClient} from "@supabase/supabase-js";
import {getTwilioCredentials} from "../communications/twilioCredentials.ts";
import {getSubaccountWebhookSecretResolver} from "../twilio/subaccountWebhookSecrets.ts";
import {recoverBookingMessageBodies,verifiedHistoricalBody,type HistoryRow,type HistoricalMessage} from "./history.ts";
type Credentials={accountSid:string;username:string;password:string};
export async function recoverHistoricalBookingTexts(db:SupabaseClient,businessId:string){
 const credentialCache=new Map<string,Promise<Credentials|null>>();
 function tenantCredentials(accountSid:string){
  if(!credentialCache.has(accountSid))credentialCache.set(accountSid,(async()=>{
   const {data:account,error}=await db.from("business_twilio_accounts").select("id").eq("business_id",businessId).eq("twilio_subaccount_sid",accountSid).maybeSingle();
   if(error||!account)return null;
   const password=await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId,subaccountSid:accountSid});
   return password?{accountSid,username:accountSid,password}:null;
  })());
  return credentialCache.get(accountSid)!;
 }
 await recoverBookingMessageBodies(db,businessId,async(row:HistoryRow)=>{
  if(row.business_id!==businessId||!/^(SM|MM)[a-zA-Z0-9]{32}$/.test(row.provider_message_id))return null;
  const {data:usage,error}=await db.from("twilio_message_usage").select("twilio_account_sid").eq("business_id",businessId).eq("twilio_message_sid",row.provider_message_id).maybeSingle();
  if(error)return null;
  const candidates:Credentials[]=[];
  if(usage?.twilio_account_sid){const credentials=await tenantCredentials(usage.twilio_account_sid);if(credentials)candidates.push(credentials);}
  else{
   const {data:account,error:accountError}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",businessId).maybeSingle();
   if(accountError)return null;
   if(account?.twilio_subaccount_sid){const credentials=await tenantCredentials(account.twilio_subaccount_sid);if(credentials)candidates.push(credentials);}
   // Legacy booking senders used the configured parent identity. Only read a
   // specific SID already attributed to this workspace by a booking/job log.
   const legacy=getTwilioCredentials();
   if(legacy.accountSid&&legacy.username&&legacy.password)candidates.push({accountSid:legacy.accountSid,username:legacy.username,password:legacy.password});
  }
  for(const credentials of candidates){
   const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}/Messages/${encodeURIComponent(row.provider_message_id)}.json`,{
    method:"GET",headers:{Authorization:`Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`},cache:"no-store",signal:AbortSignal.timeout(4000),
   });
   if(response.status===404)continue;
   if(!response.ok)return null;
   const message=await response.json() as HistoricalMessage;
   const body=verifiedHistoricalBody(message,row,credentials.accountSid);
   return body?{body,status:message.status}:null;
  }
  return null;
 });
}
