import {notFound} from "next/navigation";
import {BusinessWebsite} from "@/components/BusinessWebsite";
import {loadBusinessWebsiteData} from "@/lib/businessWebsite";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {loadWebsiteBuilderDraftForBusinessSlug} from "@/lib/websiteBuilderDraft";
import {submitWebsiteRequest} from "../../[siteSlug]/actions";

export const dynamic="force-dynamic";

export default async function DraftWebsitePreview({params}:{params:Promise<{siteSlug:string}>}){
 const {siteSlug}=await params;
 const db=getSupabaseAdmin();
 if(!db)notFound();
 const draft=await loadWebsiteBuilderDraftForBusinessSlug(db,siteSlug);
 if(!draft)notFound();
 const {data:settings}=await db.from("business_website_settings").select("*").eq("business_id",draft.business_id).maybeSingle();
 if(!settings)notFound();
 const site=await loadBusinessWebsiteData(db,settings,{includeExternalReviews:true});
 if(!site)notFound();
 return <BusinessWebsite site={site} requestAction={submitWebsiteRequest.bind(null,siteSlug)} preview/>;
}
