import {NextResponse} from "next/server";
import {unstable_cache} from "next/cache";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

const statuses=new Set(["accepted","rejected","not_selected","unavailable"]);
const kinds=new Set(["decision","status_observed"]);

const businessIdForBookingSlug=unstable_cache(async(businessSlug:string)=>{
 const db=getSupabaseAdmin();if(!db)return null;
 const {data:bookingSettings}=await db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
 if(bookingSettings?.business_id)return bookingSettings.business_id;
 const {data:websiteSettings}=await db.from("business_website_settings").select("business_id").ilike("public_slug",businessSlug).eq("status","published").maybeSingle();
 if(websiteSettings?.business_id)return websiteSettings.business_id;
 const {data:business}=await db.from("businesses").select("id").ilike("slug",businessSlug).maybeSingle();
 return business?.id??null;
},["booking-consent-business-id"],{revalidate:300});

/** Stores an aggregate observation only. Never accept client identifiers here. */
export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const body=await request.json().catch(()=>null) as {analyticsStatus?:unknown;marketingStatus?:unknown;kind?:unknown}|null;
 const analyticsStatus=typeof body?.analyticsStatus==="string"?body.analyticsStatus:"";
 const marketingStatus=typeof body?.marketingStatus==="string"?body.marketingStatus:null;
 const kind=typeof body?.kind==="string"?body.kind:"";
 if(!statuses.has(analyticsStatus)||!kinds.has(kind)||(marketingStatus!==null&&!statuses.has(marketingStatus)))return NextResponse.json({error:"Invalid consent observation."},{status:400});
 const db=getSupabaseAdmin();if(!db)return new NextResponse(null,{status:204});
 const {businessSlug}=await params;const businessId=await businessIdForBookingSlug(businessSlug);
 if(!businessId)return new NextResponse(null,{status:204});
 const {error}=await db.from("analytics_consent_observations").insert({business_id:businessId,analytics_status:analyticsStatus,marketing_status:marketingStatus,observation_kind:kind});
 if(error)console.warn("Consent observation save failed",{businessId,code:error.code});
 return new NextResponse(null,{status:204});
}
