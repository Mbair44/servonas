import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {syncGoogleAdsSpend} from "@/lib/googleAdsSpendSync";
export const runtime="nodejs";
export async function GET(request:Request){
 if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data,error}=await db.from("business_google_ads_connections").select("business_id,google_ads_customer_id,status").not("google_ads_customer_id","is",null).neq("status","disconnected");
 if(error)return NextResponse.json({error:"Google Ads connections unavailable"},{status:500});
 const settled=await Promise.allSettled((data??[]).map(row=>syncGoogleAdsSpend({businessId:row.business_id})));
 const succeeded=settled.filter(row=>row.status==="fulfilled").length,failed=settled.length-succeeded;
 if(failed)console.error("Google Ads scheduled spend sync failures",{failed});
 return NextResponse.json({ok:failed===0,succeeded,failed});
}
