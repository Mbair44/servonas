import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";

export async function POST(_:Request,{params}:{params:Promise<{businessSlug:string;notificationId:string}>}){
 const {businessSlug,notificationId}=await params;const {supabase,business}=await requireWorkspace(businessSlug);
 const {error}=await supabase.from("business_notifications").update({status:"read",read_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("business_id",business.id).eq("id",notificationId).eq("status","unread");
 if(error)return NextResponse.json({error:"Notification could not be marked read."},{status:400});
 return NextResponse.json({ok:true});
}
