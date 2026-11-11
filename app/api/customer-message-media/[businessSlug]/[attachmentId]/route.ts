import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {customerMessageMediaBucket} from "@/lib/customerMessages/media";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{businessSlug:string;attachmentId:string}>}){
 const {businessSlug,attachmentId}=await params,{business}=await requireWorkspace(businessSlug),db=getSupabaseAdmin();if(!db)return new NextResponse(null,{status:503});
 const {data}=await db.from("customer_message_attachments").select("storage_path,content_type,processing_status").eq("id",attachmentId).eq("business_id",business.id).maybeSingle();
 if(!data?.storage_path||data.processing_status!=="ready")return new NextResponse(null,{status:404});
 const file=await db.storage.from(customerMessageMediaBucket).download(data.storage_path);if(file.error||!file.data)return new NextResponse(null,{status:404});
 const bytes=new Uint8Array(await file.data.arrayBuffer()),range=request.headers.get("range"),headers={"Content-Type":data.content_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Accept-Ranges":"bytes"};
 if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return new NextResponse(null,{status:416,headers:{...headers,"Content-Range":`bytes */${bytes.byteLength}`}});const start=match[1]?Number(match[1]):0,end=match[2]?Math.min(Number(match[2]),bytes.byteLength-1):bytes.byteLength-1;if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||start>end||start>=bytes.byteLength)return new NextResponse(null,{status:416,headers:{...headers,"Content-Range":`bytes */${bytes.byteLength}`}});const chunk=bytes.slice(start,end+1);return new NextResponse(chunk,{status:206,headers:{...headers,"Content-Length":String(chunk.byteLength),"Content-Range":`bytes ${start}-${end}/${bytes.byteLength}`}});}
 return new NextResponse(bytes,{headers:{...headers,"Content-Length":String(bytes.byteLength)}});
}
