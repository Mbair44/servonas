"use server";
import {requireWorkspace} from "@/lib/workspace";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {sendTenantTwilioMessage,TenantSmsError} from "@/lib/twilio/messageUsage";
import {loadInbox,markConversationRead,replyToConversation} from "@/lib/customerMessages/service";
async function context(slug:string){
 const {business}=await requireWorkspace(slug);
 const db=getSupabaseAdmin();if(!db)throw new Error("Messaging storage is unavailable.");
 return {db,businessId:business.id as string};
}
export async function refreshInbox(slug:string){const {db,businessId}=await context(slug);return loadInbox(db,businessId);}
export async function openConversation(slug:string,key:string){const {db,businessId}=await context(slug);await markConversationRead(db,businessId,key);return loadInbox(db,businessId);}
export async function sendReply(slug:string,input:{key:string;body:string;requestId:string}){
 const {db,businessId}=await context(slug);
 try{return {message:await replyToConversation(db,businessId,input,sendTenantTwilioMessage)};}
 catch(error){return {error:error instanceof TenantSmsError?`${error.message}${error.code?` (Twilio ${error.code})`:""}`:error instanceof Error?error.message:"Could not send this message."};}
}
