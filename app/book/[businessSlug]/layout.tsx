import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {normalizeGoogleAdsTagId} from "@/lib/googleTag";
import {TenantGoogleAdsTag} from "@/components/TenantGoogleAdsTag";
import {loadPublicBookingSettings} from "./loadPublicBookingData";

export default async function TenantBookingLayout({params,children}:{params:Promise<{businessSlug:string}>;children:React.ReactNode}){
 const {businessSlug}=await params,booking=await loadPublicBookingSettings(businessSlug),db=getSupabaseAdmin();
 const {data:settings}=db&&booking?await db.from("business_website_settings").select("google_ads_tag_id").eq("business_id",booking.business_id).maybeSingle():{data:null};
 return <>{booking&&<TenantGoogleAdsTag tagId={normalizeGoogleAdsTagId(settings?.google_ads_tag_id)} scope={booking.business_id}/>} {children}</>;
}
