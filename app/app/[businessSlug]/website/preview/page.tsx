import {BusinessWebsite} from "@/components/BusinessWebsite";
import {loadBusinessWebsiteData} from "@/lib/businessWebsite";
import {requireWorkspace} from "@/lib/workspace";

export const dynamic="force-dynamic";
export default async function WebsitePreview({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,{supabase,business}=await requireWorkspace(businessSlug);
 const {data:stored}=await supabase.from("business_website_settings").select("*").eq("business_id",business.id).maybeSingle();
 const settings=stored??{business_id:business.id,template_key:"modern",primary_color:business.primary_color??"#1769f5",secondary_color:"#0b1733",request_service_enabled:true,booking_enabled:false,photo_urls:[]};
 const site=await loadBusinessWebsiteData(supabase,settings);
 if(!site)return <main className="business-site"><div className="workspace-notice error">The website preview could not be loaded.</div></main>;
 return <BusinessWebsite site={site} preview/>;
}
