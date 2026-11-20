import {mobileConversationKeySchema,markConversationReadDataSchema} from "@servonas/shared";
import {createMobileAuthorizationContext,MobileApiError,newMobileRequestId,requireMobileMessagingWorkspace} from "@/lib/mobileApi";
import {handleMobileApiError,mobileSuccess} from "@/lib/mobileApiResponse";
import {markConversationRead} from "@/lib/customerMessages/service";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{businessId:string;conversationKey:string}>}){
 const requestId=newMobileRequestId();
 try{
  const {businessId,conversationKey}=await params,key=mobileConversationKeySchema.parse(decodeURIComponent(conversationKey));
  const context=await createMobileAuthorizationContext(request);requireMobileMessagingWorkspace(context,businessId);
  const db=getSupabaseAdmin();if(!db)throw new MobileApiError("SERVICE_UNAVAILABLE","Messages are temporarily unavailable.",503,true);
  const marked=await markConversationRead(db,businessId,key);
  return mobileSuccess(markConversationReadDataSchema.parse({markedCount:marked.length}),requestId);
 }catch(error){return handleMobileApiError(error,requestId);}
}
