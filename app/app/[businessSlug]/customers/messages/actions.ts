"use server";
import {requireWorkspace} from "@/lib/workspace";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {sendTenantTwilioMessage,TenantSmsError} from "@/lib/twilio/messageUsage";
import {recoverHistoricalBookingTexts} from "@/lib/customerMessages/historyProvider";
import {loadInbox,markConversationRead,replyToConversation} from "@/lib/customerMessages/service";
import {allowedCustomerMedia,customerMessageMediaBucket,maxCustomerMediaAttachments} from "@/lib/customerMessages/media";
async function context(slug:string){
 const {business}=await requireWorkspace(slug);
 const db=getSupabaseAdmin();if(!db)throw new Error("Messaging storage is unavailable.");
 return {db,businessId:business.id as string};
}
export async function refreshInbox(slug:string){const {db,businessId}=await context(slug);return loadInbox(db,businessId);}
export async function openConversation(slug:string,key:string){const {db,businessId}=await context(slug);await markConversationRead(db,businessId,key);return loadInbox(db,businessId);}
export async function prepareMessageMediaUpload(slug:string,input:{name:string;type:string;size:number;ordinal:number}){
 const {db,businessId}=await context(slug);if(!Number.isInteger(input.ordinal)||input.ordinal<0||input.ordinal>=maxCustomerMediaAttachments||!allowedCustomerMedia(input.type,input.size))throw new Error("Choose a JPG, PNG, or GIF up to 5 MB, or an MP4/3GP video up to 600 KB.");
 const extension={"image/jpeg":"jpg","image/png":"png","image/gif":"gif","video/mp4":"mp4","video/3gpp":"3gp"}[input.type]??"bin";
 const {data:attachment,error}=await db.from("customer_message_attachments").insert({business_id:businessId,outbound_request_id:crypto.randomUUID(),ordinal:input.ordinal,direction:"outbound",content_type:input.type,file_size_bytes:input.size,storage_path:`${businessId}/drafts/${crypto.randomUUID()}.${extension}`,processing_status:"uploaded"}).select("id,storage_path").single();
 if(error||!attachment)throw new Error("Could not prepare the attachment.");const upload=await db.storage.from(customerMessageMediaBucket).createSignedUploadUrl(attachment.storage_path);if(upload.error||!upload.data){await db.from("customer_message_attachments").delete().eq("id",attachment.id).eq("business_id",businessId);throw new Error("Could not prepare the attachment upload.");}
 return{id:attachment.id,bucket:customerMessageMediaBucket,path:attachment.storage_path,token:upload.data.token};
}
export async function sendReply(slug:string,input:{key:string;body:string;requestId:string;attachmentIds?:string[];target?:{customerId:string;phone:string}}){
 const {db,businessId}=await context(slug);
 try{return {message:await replyToConversation(db,businessId,input,sendTenantTwilioMessage)};}
 catch(error){return {error:error instanceof TenantSmsError?`${error.message}${error.code?` (Twilio ${error.code})`:""}`:error instanceof Error?error.message:"Could not send this message."};}
}

export async function recoverMessageHistory(slug:string){
 const {db,businessId}=await context(slug);
 await recoverHistoricalBookingTexts(db,businessId);
}
