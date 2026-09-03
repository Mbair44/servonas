import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {syncGoogleBusinessReviewNotifications} from "@/lib/businessNotifications";

export async function GET(_:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;const {supabase,business}=await requireWorkspace(businessSlug);
 await syncGoogleBusinessReviewNotifications({businessId:business.id,businessSlug}).catch(error=>console.warn("Notification review sync skipped",{businessId:business.id,message:error instanceof Error?error.message:"unknown"}));
 const [{data:notifications},{count}]=await Promise.all([
  supabase.from("business_notifications").select("id,type,category,title,body,status,priority,action_label,action_url,created_at").eq("business_id",business.id).not("status","in","(resolved,dismissed)").order("created_at",{ascending:false}).limit(5),
  supabase.from("business_notifications").select("id",{count:"exact",head:true}).eq("business_id",business.id).eq("status","unread"),
 ]);
 return NextResponse.json({notifications:notifications??[],unread:count??0},{headers:{"Cache-Control":"no-store"}});
}
