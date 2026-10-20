import {NextResponse} from "next/server";
import {syncMetaAdsPerformance} from "@/lib/metaAdsManagement";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export const runtime="nodejs";
export async function GET(request:Request){
 if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data:connections,error:connectionError}=await db.from("business_ad_platform_connections").select("business_id").eq("provider","meta").not("external_account_id","is",null).not("status","in","(disconnected,authorization_expired)");
 if(connectionError)return NextResponse.json({error:"Meta Ads connections unavailable"},{status:500});
 const businessIds=[...new Set((connections??[]).map(row=>row.business_id))];
 if(!businessIds.length)return NextResponse.json({ok:true,succeeded:0,failed:0});
 const {data:businesses,error:businessError}=await db.from("businesses").select("id,slug").in("id",businessIds);
 if(businessError)return NextResponse.json({error:"Businesses unavailable"},{status:500});
 const slugs=new Map((businesses??[]).map(business=>[business.id,business.slug]));
 const settled=await Promise.allSettled(businessIds.flatMap(businessId=>{const businessSlug=slugs.get(businessId);return businessSlug?[syncMetaAdsPerformance({businessId,businessSlug})]:[]}));
 const succeeded=settled.filter(row=>row.status==="fulfilled").length,failed=settled.length-succeeded;
 if(failed)console.error("Meta Ads scheduled spend sync failures",{failed});
 return NextResponse.json({ok:failed===0,succeeded,failed});
}
