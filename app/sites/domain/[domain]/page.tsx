import {notFound} from "next/navigation";
import {BusinessWebsite} from "@/components/BusinessWebsite";
import {loadPublishedBusinessWebsiteByDomain} from "@/lib/businessWebsite";
import {normalizeWebsiteDomain} from "@/lib/website";
import {submitWebsiteRequest} from "../../[siteSlug]/actions";
import type {Metadata} from "next";

export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{domain:string}>}):Promise<Metadata>{
 const raw=decodeURIComponent((await params).domain),domain=normalizeWebsiteDomain(raw);
 if(!domain)return {};
 const record=await loadPublishedBusinessWebsiteByDomain(domain);
 if(!record?.site)return {};
 const {site}=record;
 return {title:site.name,description:site.heroSubheading,icons:site.logoUrl?{icon:[{url:site.logoUrl}],shortcut:site.logoUrl,apple:site.logoUrl}:undefined};
}
export default async function CustomDomainBusinessSite({params}:{params:Promise<{domain:string}>}){
 const raw=decodeURIComponent((await params).domain),domain=normalizeWebsiteDomain(raw);
 if(!domain)notFound();
 const record=await loadPublishedBusinessWebsiteByDomain(domain);
 if(!record)notFound();
 const {settings,site}=record;
 return <BusinessWebsite site={site} requestAction={submitWebsiteRequest.bind(null,settings.public_slug)}/>;
}
