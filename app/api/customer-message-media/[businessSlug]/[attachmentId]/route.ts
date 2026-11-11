import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {customerMessageMediaBucket} from "@/lib/customerMessages/media";
export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:Promise<{businessSlug:string;attachmentId:string}>}){
 const {businessSlug,attachmentId}=await params,{business}=await requireWorkspace(businessSlug),db=getSupabaseAdmin();if(!db)return new NextResponse(null,{status:503});
 const {data}=await db.from("customer_message_attachments").select("storage_path,content_type,processing_status").eq("id",attachmentId).eq("business_id",business.id).maybeSingle();
 if(!data?.storage_path||data.processing_status!=="ready")return new NextResponse(null,{status:404});
 const file=await db.storage.from(customerMessageMediaBucket).download(data.storage_path);if(file.error||!file.data)return new NextResponse(null,{status:404});
 return new NextResponse(file.data,{headers:{"Content-Type":data.content_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
