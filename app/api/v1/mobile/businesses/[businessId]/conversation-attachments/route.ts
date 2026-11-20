import {prepareConversationAttachmentDataSchema,prepareConversationAttachmentRequestSchema} from "@servonas/shared";
import {createMobileAuthorizationContext,MobileApiError,newMobileRequestId,requireMobileMessagingWorkspace} from "@/lib/mobileApi";
import {handleMobileApiError,mobileSuccess} from "@/lib/mobileApiResponse";
import {allowedCustomerMedia,customerMessageMediaBucket,maxCustomerMediaAttachments} from "@/lib/customerMessages/media";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export const dynamic="force-dynamic";
const extensions:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/gif":"gif","video/mp4":"mp4","video/3gpp":"3gp"};

/** Creates a short-lived, write-only storage capability for one office-authorized draft.
 * The native client never receives a read URL or a storage service credential. */
export async function POST(request:Request,{params}:{params:Promise<{businessId:string}>}){
 const requestId=newMobileRequestId();
 try{
  const {businessId}=await params,input=prepareConversationAttachmentRequestSchema.parse(await request.json());
  if(input.ordinal>=maxCustomerMediaAttachments||!allowedCustomerMedia(input.contentType,input.fileSizeBytes))throw new MobileApiError("VALIDATION_FAILED","Choose a supported image up to 5 MB or a supported video up to 600 KB.",400);
  const context=await createMobileAuthorizationContext(request);requireMobileMessagingWorkspace(context,businessId);
  const db=getSupabaseAdmin();if(!db)throw new MobileApiError("SERVICE_UNAVAILABLE","Message uploads are temporarily unavailable.",503,true);
  const {data:attachment,error}=await db.from("customer_message_attachments").insert({business_id:businessId,outbound_request_id:crypto.randomUUID(),uploaded_by_user_id:context.user.id,ordinal:input.ordinal,direction:"outbound",content_type:input.contentType,file_size_bytes:input.fileSizeBytes,storage_path:`${businessId}/drafts/${crypto.randomUUID()}.${extensions[input.contentType]}`,processing_status:"uploaded"}).select("id,storage_path").single();
  if(error||!attachment)throw new MobileApiError("SERVICE_UNAVAILABLE","Could not prepare the attachment upload.",503,true);
  const upload=await db.storage.from(customerMessageMediaBucket).createSignedUploadUrl(attachment.storage_path);
  if(upload.error||!upload.data?.token){await db.from("customer_message_attachments").delete().eq("id",attachment.id).eq("business_id",businessId);throw new MobileApiError("SERVICE_UNAVAILABLE","Could not prepare the attachment upload.",503,true);}
  return mobileSuccess(prepareConversationAttachmentDataSchema.parse({attachmentId:attachment.id,bucket:customerMessageMediaBucket,path:attachment.storage_path,uploadToken:upload.data.token}),requestId);
 }catch(error){return handleMobileApiError(error,requestId);}
}
