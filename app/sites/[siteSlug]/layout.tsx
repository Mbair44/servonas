import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {normalizeGoogleAdsTagId} from "@/lib/googleTag";
import {TenantGoogleAdsTag} from "@/components/TenantGoogleAdsTag";

export default async function TenantSiteLayout({params,children}:{params:Promise<{siteSlug:string}>;children:React.ReactNode}){
 const {siteSlug}=await params,db=getSupabaseAdmin();
 const {data:settings}=db?await db.from("business_website_settings").select("business_id,google_ads_tag_id").ilike("public_slug",siteSlug).eq("status","published").maybeSingle():{data:null};
 return <>{settings&&<TenantGoogleAdsTag tagId={normalizeGoogleAdsTagId(settings.google_ads_tag_id)} scope={settings.business_id}/>} {children}</>;
}
