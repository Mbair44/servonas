import type {SupabaseClient} from "@supabase/supabase-js";
import {normalizePhone} from "./model.ts";
export type HistoryRow={id:string;business_id:string;provider_message_id:string;counterparty_phone_e164:string;body:string};
export type HistoricalMessage={sid:string;account_sid:string;direction:string;to:string;body:string;status:string};
export function verifiedHistoricalBody(message:HistoricalMessage,row:HistoryRow,accountSid:string){
 if(message.sid!==row.provider_message_id||message.account_sid!==accountSid||!message.direction.startsWith("outbound")||normalizePhone(message.to)!==normalizePhone(row.counterparty_phone_e164))return null;
 return message.body?.trim()&&message.body.length<=1600?message.body:null;
}
export async function recoverBookingMessageBodies(db:SupabaseClient,businessId:string,read:(row:HistoryRow)=>Promise<{body:string;status:string}|null>){
 const now=new Date().toISOString();
 const {data:rows,error}=await db.from("customer_messages").select("id,business_id,provider_message_id,counterparty_phone_e164,body")
  .eq("business_id",businessId).eq("direction","outbound").eq("provider","twilio").eq("history_body_pending",true).lte("history_retry_at",now).order("history_retry_at").limit(5);
 if(error)throw new Error("Historical message retrieval is unavailable.");
 await Promise.all((rows as HistoryRow[]).map(async row=>{
  // Atomic retry lease prevents simultaneous polling tabs from requesting the
  // same provider history. Failures back off for an hour, never resend SMS.
  const {data:claimed,error:claimError}=await db.from("customer_messages").update({history_retry_at:new Date(Date.now()+3600000).toISOString()})
   .eq("business_id",businessId).eq("id",row.id).eq("history_body_pending",true).lte("history_retry_at",now).select("id").maybeSingle();
  if(claimError||!claimed)return;
  let original:null|{body:string;status:string}=null;
  try{original=await read(row);}catch{/* Keep the recorded send visible when provider history is unavailable. */}
  const patch=original?{body:original.body,status:original.status,history_body_pending:false}
   :{body:row.body.replace("Original message text was not saved; retrieval pending.","Original message text is unavailable from Twilio.")};
  const {error:saveError}=await db.from("customer_messages").update(patch).eq("business_id",businessId).eq("id",row.id).eq("history_body_pending",true);
  if(saveError)throw new Error("Historical message text could not be saved.");
 }));
}
