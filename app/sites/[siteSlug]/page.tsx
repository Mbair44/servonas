import {notFound} from "next/navigation";
import {BusinessWebsite} from "@/components/BusinessWebsite";
import {loadBusinessWebsiteData} from "@/lib/businessWebsite";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {submitWebsiteRequest} from "./actions";

export const dynamic="force-dynamic";
export default async function PublicBusinessSite({params}:{params:Promise<{siteSlug:string}>}){
 const {siteSlug}=await params,db=getSupabaseAdmin();if(!db)notFound();
 const {data:settings}=await db.from("business_website_settings").select("*").ilike("public_slug",siteSlug).eq("status","published").maybeSingle();
 if(!settings)notFound();
 const site=await loadBusinessWebsiteData(db,settings);if(!site)notFound();
 return <BusinessWebsite site={site} requestAction={submitWebsiteRequest.bind(null,siteSlug)}/>;
}
