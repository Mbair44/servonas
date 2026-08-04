import {notFound} from "next/navigation";
import {BusinessWebsite} from "@/components/BusinessWebsite";
import {loadBusinessWebsiteData} from "@/lib/businessWebsite";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {normalizeWebsiteDomain} from "@/lib/website";
import {submitWebsiteRequest} from "../../[siteSlug]/actions";

export const dynamic="force-dynamic";
export default async function CustomDomainBusinessSite({params}:{params:Promise<{domain:string}>}){
 const raw=decodeURIComponent((await params).domain),domain=normalizeWebsiteDomain(raw),db=getSupabaseAdmin();
 if(!domain||!db)notFound();
 const {data:settings}=await db.from("business_website_settings").select("*").ilike("custom_domain",domain).eq("domain_status","connected").eq("status","published").maybeSingle();
 if(!settings)notFound();
 const site=await loadBusinessWebsiteData(db,settings);if(!site)notFound();
 return <BusinessWebsite site={site} requestAction={submitWebsiteRequest.bind(null,settings.public_slug)}/>;
}
