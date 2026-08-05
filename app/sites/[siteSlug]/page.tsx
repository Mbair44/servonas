import {notFound} from "next/navigation";
import {BusinessWebsite} from "@/components/BusinessWebsite";
import {loadBusinessWebsiteData} from "@/lib/businessWebsite";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {submitWebsiteRequest} from "./actions";
import type {Metadata} from "next";

export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{siteSlug:string}>}):Promise<Metadata>{
 const {siteSlug}=await params,db=getSupabaseAdmin();if(!db)return {};
 const {data:settings}=await db.from("business_website_settings").select("*").ilike("public_slug",siteSlug).eq("status","published").maybeSingle();
 if(!settings)return {};
 const site=await loadBusinessWebsiteData(db,settings);if(!site)return {};
 return {title:site.name,description:site.heroSubheading,icons:site.logoUrl?{icon:[{url:site.logoUrl}],shortcut:site.logoUrl,apple:site.logoUrl}:undefined};
}
export default async function PublicBusinessSite({params}:{params:Promise<{siteSlug:string}>}){
 const {siteSlug}=await params,db=getSupabaseAdmin();if(!db)notFound();
 const {data:settings}=await db.from("business_website_settings").select("*").ilike("public_slug",siteSlug).eq("status","published").maybeSingle();
 if(!settings)notFound();
 const site=await loadBusinessWebsiteData(db,settings);if(!site)notFound();
 return <BusinessWebsite site={site} requestAction={submitWebsiteRequest.bind(null,siteSlug)}/>;
}
