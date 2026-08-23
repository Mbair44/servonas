import {BusinessWebsite} from "@/components/BusinessWebsite";
import {loadBusinessWebsiteData} from "@/lib/businessWebsite";
import {normalizeWebsiteDomain, validWebsiteColor, websiteTemplates} from "@/lib/website";
import {requireWorkspace} from "@/lib/workspace";

export const dynamic="force-dynamic";
export default async function WebsitePreview({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,{supabase,business}=await requireWorkspace(businessSlug);
 const q=await searchParams;
 const {data:stored}=await supabase.from("business_website_settings").select("*").eq("business_id",business.id).maybeSingle();
 const settings={...(stored??{business_id:business.id,template_key:"modern",primary_color:business.primary_color??"#1769f5",secondary_color:"#0b1733",request_service_enabled:true,booking_enabled:false,photo_urls:[]}),
  template_key:websiteTemplates.includes((q.template??"") as typeof websiteTemplates[number])?q.template:stored?.template_key??"modern",
  primary_color:validWebsiteColor(q.primaryColor??"")?q.primaryColor:stored?.primary_color??business.primary_color??"#1769f5",
  secondary_color:validWebsiteColor(q.secondaryColor??"")?q.secondaryColor:stored?.secondary_color??"#0b1733",
  hero_heading:q.heroHeading?.trim()||stored?.hero_heading,
  hero_subheading:q.heroSubheading?.trim()||stored?.hero_subheading,
  custom_domain:normalizeWebsiteDomain(q.customDomain??"")||stored?.custom_domain,
 };
 const site=await loadBusinessWebsiteData(supabase,settings,{includeExternalReviews:true});
 if(!site)return <main className="business-site"><div className="workspace-notice error">The website preview could not be loaded.</div></main>;
 return <BusinessWebsite site={site} preview/>;
}
