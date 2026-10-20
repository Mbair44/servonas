import {NextResponse} from "next/server";
import {syncGoogleAdsSpend} from "@/lib/googleAdsSpendSync";
import {syncMetaAdsPerformance} from "@/lib/metaAdsManagement";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
export const runtime="nodejs";
export async function GET(request:Request){
 if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const params=new URL(request.url).searchParams,slug=params.get("business_slug")??"",dateFrom=params.get("date_from")??undefined,dateThrough=params.get("date_through")??undefined,providers=(params.get("providers")??"").split(",").filter((provider):provider is "google_ads"|"meta"=>provider==="google_ads"||provider==="meta");
 if(!slug||!dateFrom||!dateThrough||!providers.length)return NextResponse.json({error:"business_slug, date_from, date_through, and providers are required."},{status:400});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data:business,error}=await db.from("businesses").select("id,slug").eq("slug",slug).maybeSingle();if(error||!business)return NextResponse.json({error:"Business not found."},{status:404});
 const results=await Promise.allSettled(providers.map(provider=>provider==="google_ads"?syncGoogleAdsSpend({businessId:business.id,dateFrom,dateThrough}):syncMetaAdsPerformance({businessId:business.id,businessSlug:business.slug,dateFrom,dateThrough})));
 const response=results.map((result,index)=>result.status==="fulfilled"?{provider:providers[index],ok:true,result:result.value}:{provider:providers[index],ok:false,error:result.reason instanceof Error?result.reason.message:"Sync failed."});
 return NextResponse.json({ok:response.every(result=>result.ok),dateFrom,dateThrough,response},{status:response.every(result=>result.ok)?200:502});
}
