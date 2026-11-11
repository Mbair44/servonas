import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getSubaccountTwilioHttpClient} from "@/lib/twilio/twilioHttp";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";

export const customerMessageMediaBucket="customer-message-media";
export const supportedCustomerMedia=new Set(["image/jpeg","image/png","image/gif","video/mp4","video/3gpp"]);
export const maxCustomerMediaBytes=5*1024*1024;
export const maxCustomerVideoBytes=600*1024;
export const maxCustomerMediaAttachments=10;
export type MessageAttachment={id:string;message_id:string|null;ordinal:number;direction:"inbound"|"outbound";content_type:string;file_size_bytes:number|null;storage_path:string|null;processing_status:"queued"|"processing"|"ready"|"failed"|"uploaded";failure_reason:string|null};

export function allowedCustomerMedia(type:string,size:number){const normalized=type.toLowerCase(),limit=normalized.startsWith("video/")?maxCustomerVideoBytes:maxCustomerMediaBytes;return supportedCustomerMedia.has(normalized)&&Number.isInteger(size)&&size>0&&size<=limit;}
const extension=(type:string)=>({"image/jpeg":"jpg","image/png":"png","image/gif":"gif","video/mp4":"mp4","video/3gpp":"3gp"}[type]??"bin");
const retryAt=(attempts:number)=>new Date(Date.now()+Math.min(3_600_000,60_000*2**Math.min(attempts,6))).toISOString();

/** Downloads only Twilio-owned HTTPS media URLs; media is persisted privately. */
export async function processCustomerMessageMedia(limit=25){
 const db=getSupabaseAdmin();if(!db)throw new Error("MMS storage is unavailable.");
 const {data:rows,error}=await db.from("customer_message_attachments").select("id,business_id,message_id,ordinal,content_type,provider_media_url,processing_status,processing_attempts,created_at").in("processing_status",["queued","failed"]).lte("next_attempt_at",new Date().toISOString()).not("provider_media_url","is",null).order("created_at").limit(Math.min(Math.max(limit,1),100));
 if(error)throw new Error("MMS queue is unavailable.");let processed=0,failed=0;
 for(const row of rows??[]){
  const claim=await db.from("customer_message_attachments").update({processing_status:"processing",updated_at:new Date().toISOString(),failure_reason:null}).eq("id",row.id).eq("processing_status",row.processing_status).select("id").maybeSingle();if(!claim.data)continue;
  processed++;
  try{
   const url=new URL(row.provider_media_url);if(url.protocol!=="https:"||!(url.hostname.endsWith("twilio.com")||url.hostname.endsWith("twiliocdn.com")))throw new Error("untrusted_media_source");
   const {data:account}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",row.business_id).eq("provisioning_status","active").maybeSingle();
   if(!account?.twilio_subaccount_sid)throw new Error("tenant_account_unavailable");
   const token=await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:row.business_id,subaccountSid:account.twilio_subaccount_sid});if(!token)throw new Error("tenant_credential_unavailable");
   const client=getSubaccountTwilioHttpClient(account.twilio_subaccount_sid,token);if(!client.fetch)throw new Error("authenticated_media_client_unavailable");const response=await client.fetch(url.toString());
   const contentType=(response.headers.get("content-type")??row.content_type).split(";")[0].toLowerCase(),length=Number(response.headers.get("content-length")??0);
   if(!response.ok||!allowedCustomerMedia(contentType,length||1))throw new Error(!response.ok?"provider_download_failed":"unsupported_or_oversized_media");
   const bytes=Buffer.from(await response.arrayBuffer());if(!allowedCustomerMedia(contentType,bytes.byteLength))throw new Error("unsupported_or_oversized_media");
   const path=`${row.business_id}/${row.message_id}/${row.ordinal}-${row.id}.${extension(contentType)}`;
   const upload=await db.storage.from(customerMessageMediaBucket).upload(path,bytes,{contentType,upsert:false});if(upload.error&& !/already exists/i.test(upload.error.message))throw new Error("private_storage_failed");
   await db.from("customer_message_attachments").update({storage_path:path,file_size_bytes:bytes.byteLength,content_type:contentType,processing_status:"ready",provider_media_url:null,processed_at:new Date().toISOString(),updated_at:new Date().toISOString(),failure_reason:null}).eq("id",row.id).eq("business_id",row.business_id);
  }catch(error){failed++;const reason=error instanceof Error?error.message:"media_processing_failed",attempts=Number(row.processing_attempts)+1;await db.from("customer_message_attachments").update({processing_status:"failed",processing_attempts:attempts,next_attempt_at:retryAt(attempts),failure_reason:reason.slice(0,120),updated_at:new Date().toISOString()}).eq("id",row.id).eq("business_id",row.business_id);}
 }
 return{processed,failed};
}

export async function signedOutboundMediaUrls(businessId:string,attachmentIds:string[],body=""){
 const db=getSupabaseAdmin();if(!db)throw new Error("MMS storage is unavailable.");
 const {data,error}=await db.from("customer_message_attachments").select("id,storage_path,content_type,file_size_bytes,processing_status,business_id,direction").eq("business_id",businessId).in("id",attachmentIds).eq("direction","outbound").eq("processing_status","uploaded");
 if(error||(data??[]).length!==attachmentIds.length)throw new Error("One or more attachments are unavailable.");
 const files=data??[];if(files.reduce((sum,file)=>sum+Number(file.file_size_bytes??0),Buffer.byteLength(body,"utf8"))>maxCustomerMediaBytes)throw new Error("Message text and attachments together must be 5 MB or smaller.");for(const file of files)if(!file.storage_path||!allowedCustomerMedia(file.content_type,Number(file.file_size_bytes)))throw new Error("One or more attachments are invalid.");
 // Twilio validates with HEAD and GET and may retry retrieval. Keep the
 // capability private but valid for 24 hours rather than a fragile few minutes.
 const signed=await Promise.all(files.map(file=>db.storage.from(customerMessageMediaBucket).createSignedUrl(file.storage_path!,86_400)));
 if(signed.some(result=>result.error||!result.data?.signedUrl))throw new Error("Could not prepare MMS attachment delivery.");
 return signed.map(result=>result.data!.signedUrl);
}

/**
 * Deliberately callable only by an explicit maintenance command. It discovers
 * historic Twilio media and queues it through the same idempotent worker; it
 * never downloads media itself and is not invoked by webhooks or page loads.
 */
export async function queueHistoricalCustomerMessageMedia(input:{businessId:string;from:string;to:string;dryRun?:boolean;limit?:number}){
 const db=getSupabaseAdmin();if(!db)throw new Error("MMS storage is unavailable.");
 const {data:account}=await db.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",input.businessId).eq("provisioning_status","active").maybeSingle();
 if(!account?.twilio_subaccount_sid)throw new Error("Tenant Twilio account is unavailable.");
 const token=await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:input.businessId,subaccountSid:account.twilio_subaccount_sid});if(!token)throw new Error("Tenant credential is unavailable.");
 const {data:numbers,error:numberError}=await db.from("twilio_phone_numbers").select("phone_number_e164").eq("business_id",input.businessId).eq("status","active").eq("provisioning_status","active");if(numberError)throw new Error("Tenant phone mapping is unavailable.");
 const client=getSubaccountTwilioHttpClient(account.twilio_subaccount_sid,token),limit=Math.min(Math.max(input.limit??500,1),1000),report:{messageSid:string;from:string;to:string;receivedAt:string;attachments:number;existing:boolean}[]=[];let queued=0;
 for(const number of numbers??[]){
  const query=new URLSearchParams({To:number.phone_number_e164,DateSentAfter:input.from,DateSentBefore:input.to,PageSize:String(Math.min(limit,1000))});
  const response=await client.request<{messages?:{sid:string;from:string;to:string;body:string;direction:string;num_media:string;date_sent:string|null;date_created:string|null}[]}>(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account.twilio_subaccount_sid)}/Messages.json?${query}`);
  for(const historic of response.messages??[]){if(report.length>=limit||historic.direction!=="inbound"||Number(historic.num_media??0)<1)continue;
   const {data:existing}=await db.from("customer_messages").select("id").eq("business_id",input.businessId).eq("provider","twilio").eq("provider_message_id",historic.sid).maybeSingle();
   const mediaResult=await client.request<{media_list?:{sid:string;uri:string;content_type:string}[]}>(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account.twilio_subaccount_sid)}/Messages/${encodeURIComponent(historic.sid)}/Media.json`),media=mediaResult.media_list??[],receivedAt=historic.date_sent??historic.date_created??new Date().toISOString();
   report.push({messageSid:historic.sid,from:historic.from,to:historic.to,receivedAt,attachments:media.length,existing:Boolean(existing)});if(input.dryRun!==false)continue;
   let messageId=existing?.id;
   if(!messageId){const intakeBody=historic.body||"[MMS attachment]",{data:intake,error:intakeError}=await db.rpc("process_inbound_sms",{p_provider_message_id:historic.sid,p_from_phone:historic.from,p_to_phone:historic.to,p_body:intakeBody,p_business_id:input.businessId,p_account_sid:account.twilio_subaccount_sid,p_opt_out_type:""});if(intakeError)throw new Error("Historic MMS intake failed.");const result=intake as {customer_id:string};const {data:timeline,error:timelineError}=await db.from("customer_messages").upsert({business_id:input.businessId,customer_id:result.customer_id,counterparty_phone_e164:historic.from,direction:"inbound",provider:"twilio",provider_message_id:historic.sid,body:historic.body??"",status:"received",source_type:"inbound_sms",received_at:receivedAt,created_at:receivedAt,updated_at:receivedAt},{onConflict:"provider,provider_message_id"}).select("id").single();if(timelineError||!timeline)throw new Error("Historic MMS timeline persistence failed.");messageId=timeline.id;}
   const values=media.slice(0,maxCustomerMediaAttachments).map((item,ordinal)=>({business_id:input.businessId,message_id:messageId,ordinal,direction:"inbound",content_type:item.content_type?.toLowerCase()||"application/octet-stream",provider_media_url:item.uri?.startsWith("http")?item.uri:`https://api.twilio.com${item.uri}`,processing_status:"queued"}));if(values.length){const {error:queueError}=await db.from("customer_message_attachments").upsert(values,{onConflict:"message_id,ordinal",ignoreDuplicates:true});if(queueError)throw new Error("Historic MMS queue could not be saved.");queued+=values.length;}
  }
 }
 return{messages:report.length,attachments:report.reduce((sum,row)=>sum+row.attachments,0),queued,dryRun:input.dryRun!==false,report};
}

export async function cleanupAbandonedCustomerMessageMedia(limit=100){
 const db=getSupabaseAdmin();if(!db)throw new Error("MMS storage is unavailable.");const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
 const {data,error}=await db.from("customer_message_attachments").select("id,business_id,storage_path").eq("direction","outbound").eq("processing_status","uploaded").is("message_id",null).lt("created_at",cutoff).limit(Math.min(Math.max(limit,1),500));if(error)throw new Error("MMS cleanup queue is unavailable.");
 let removed=0;for(const row of data??[]){if(row.storage_path)await db.storage.from(customerMessageMediaBucket).remove([row.storage_path]);const result=await db.from("customer_message_attachments").delete().eq("id",row.id).eq("business_id",row.business_id).is("message_id",null);if(!result.error)removed++;}return{removed};
}
