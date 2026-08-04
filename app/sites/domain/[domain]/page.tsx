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
 // Connecting a custom production hostname is an explicit go-live action.
 // Keep draft Servonas URLs private, but do not return a 404 from a domain the
 // owner has successfully connected and verified through Vercel.
 const {data:settings,error}=await db.from("business_website_settings").select("*").ilike("custom_domain",domain).or("status.eq.published,domain_status.eq.connected").maybeSingle();
 if(error)console.error("Custom website domain lookup failed",{domain,code:error.code});
 if(!settings)notFound();
 const site=await loadBusinessWebsiteData(db,settings);if(!site)notFound();
 return <BusinessWebsite site={site} requestAction={submitWebsiteRequest.bind(null,settings.public_slug)}/>;
}
