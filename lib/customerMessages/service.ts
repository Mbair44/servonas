import type {SupabaseClient} from "@supabase/supabase-js";
import {conversations,normalizePhone,type CustomerMessage,type Contact} from "./model.ts";
const columns="id,business_id,customer_id,counterparty_phone_e164,direction,body,status,source_type,read_at,created_at,sent_at,received_at,provider_message_id";
export async function loadInbox(db:SupabaseClient,businessId:string){
 const messages:CustomerMessage[]=[];
 for(let offset=0;;offset+=500){const {data,error}=await db.from("customer_messages").select(columns).eq("business_id",businessId).order("created_at").order("id").range(offset,offset+499);if(error)throw new Error("Could not load messages.");messages.push(...data as CustomerMessage[]);if(data.length<500)break;}
 const customers:Contact[]=[];
 const ids=[...new Set(messages.flatMap(m=>m.customer_id?[m.customer_id]:[]))];
 for(let offset=0;offset<ids.length;offset+=100){const {data,error}=await db.from("customers").select("id,first_name,last_name,company_name").eq("business_id",businessId).in("id",ids.slice(offset,offset+100));if(error)throw new Error("Could not load customer names.");customers.push(...data);}
 return conversations(messages,customers);
}
export async function markConversationRead(db:SupabaseClient,businessId:string,key:string){
 const thread=(await loadInbox(db,businessId)).find(c=>c.key===key);if(!thread)throw new Error("Conversation not found in this workspace.");
 const ids=thread.messages.filter(m=>m.direction==="inbound"&&!m.read_at).map(m=>m.id),now=new Date().toISOString();
 for(let offset=0;offset<ids.length;offset+=100){const {error}=await db.from("customer_messages").update({read_at:now,updated_at:now}).eq("business_id",businessId).eq("direction","inbound").is("read_at",null).in("id",ids.slice(offset,offset+100));if(error)throw new Error("Could not mark messages read.");}
 return ids;
}
type Send=(input:{businessId:string;to:string;body:string;sourceType:string;sourceId:string})=>Promise<{sid:string}>;
export async function replyToConversation(db:SupabaseClient,businessId:string,input:{key:string;body:string;requestId:string},send:Send){
 const body=input.body.trim();if(!body||body.length>1600)throw new Error("Enter a message between 1 and 1600 characters.");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId))throw new Error("Invalid send request.");
 const thread=(await loadInbox(db,businessId)).find(c=>c.key===input.key);if(!thread)throw new Error("Conversation not found in this workspace.");
 const to=normalizePhone(thread.phone);if(!/^\+[1-9]\d{7,14}$/.test(to))throw new Error("This conversation does not have a valid reply number.");
 const {error:claimError}=await db.from("customer_message_send_requests").insert({business_id:businessId,request_id:input.requestId,conversation_key:input.key,body});
 let sid:string;
 if(claimError){
  if(claimError.code!=="23505")throw new Error("Could not reserve this send. Please try again.");
  const {data:existing,error}=await db.from("customer_message_send_requests").select("conversation_key,body,provider_message_id").eq("business_id",businessId).eq("request_id",input.requestId).single();
  if(error||existing?.conversation_key!==input.key||existing.body!==body)throw new Error("This send request was already used.");
  if(!existing.provider_message_id)throw new Error("This send is pending or its delivery is uncertain. Refresh before sending another message; this request will not be sent twice.");
  sid=existing.provider_message_id;
 }else{
  const result=await send({businessId,to,body,sourceType:"manual_reply",sourceId:input.requestId});sid=result.sid;
  const {error}=await db.from("customer_message_send_requests").update({provider_message_id:sid}).eq("business_id",businessId).eq("request_id",input.requestId);
  if(error)throw new Error("Message accepted, but confirmation could not be saved. Refresh the inbox; do not resend.");
 }
 const {data:message,error}=await db.from("customer_messages").select(columns).eq("business_id",businessId).eq("provider","twilio").eq("provider_message_id",sid).single();
 if(error||!message)throw new Error("Message accepted, but could not be loaded. Refresh the inbox; do not resend.");
 return message as CustomerMessage;
}
