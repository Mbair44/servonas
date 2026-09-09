import {notFound} from "next/navigation";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {loadPublishedBusinessWebsiteByDomain} from "@/lib/businessWebsite";
import {PromotionLanding} from "@/components/PromotionLanding";
import {CategoryLanding} from "@/components/CategoryLanding";
import {TenantMetaPixel} from "@/components/TenantMetaPixel";
import {TenantBookingFunnelTracker} from "@/components/TenantBookingFunnelTracker";
import {LocationLanding} from "@/components/LocationLanding";
import type {Metadata} from "next";

export const dynamic="force-dynamic";

export async function generateMetadata({params}:{params:Promise<{domain:string;promotionSlug:string}>}):Promise<Metadata>{const {domain,promotionSlug}=await params,db=getSupabaseAdmin();if(!db)return{};const normalized=domain.toLowerCase().replace(/^www\./,""),{data:website}=await db.from("business_website_settings").select("business_id").or(`custom_domain.ilike.${normalized},custom_domain.ilike.www.${normalized}`).eq("status","published").maybeSingle();if(!website)return{};const {data:page}=await db.from("business_location_pages").select("page_title,meta_description,og_title,og_description,slug").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("status","published").maybeSingle();if(!page)return{};const canonical=`https://${domain}/${page.slug}`;return{title:page.page_title,description:page.meta_description,alternates:{canonical},openGraph:{title:page.og_title,description:page.og_description,url:canonical,type:"website"},robots:{index:true,follow:true}};}

export default async function DomainLandingPage({params}:{params:Promise<{domain:string;promotionSlug:string}>}){
 const {domain,promotionSlug}=await params;
 const [record,db]=await Promise.all([loadPublishedBusinessWebsiteByDomain(domain,"/sites/domain/[domain]"),Promise.resolve(getSupabaseAdmin())]);
 if(!db||record.kind!=="ok")notFound();
 const site=record.site,businessId=record.settings.business_id;
 const [{data:promotion},{data:categoryPage},{data:locationPage},{data:nearbyPages},{data:items}]=await Promise.all([
  db.from("promotions").select("*,discounts(*)").eq("business_id",businessId).ilike("slug",promotionSlug).eq("landing_page_enabled",true).maybeSingle(),
  db.from("category_website_pages").select("*").eq("business_id",businessId).ilike("slug",promotionSlug).eq("status","published").maybeSingle(),
  db.from("business_location_pages").select("*").eq("business_id",businessId).ilike("slug",promotionSlug).eq("status","published").maybeSingle(),
  db.from("business_location_pages").select("slug,city,state").eq("business_id",businessId).eq("status","published").neq("slug",promotionSlug).limit(6),
  db.from("inventory_items").select("id,name,description,daily_price_cents,image_url,category_id").eq("business_id",businessId).eq("active",true),
 ]);
 if(promotion){
  const {data:categories}=await db.from("promotion_categories").select("category_id").eq("promotion_id",promotion.id);
  const categoryIds=new Set((categories??[]).map(row=>row.category_id));
  return <>{site.metaPixelId&&<TenantMetaPixel pixelId={site.metaPixelId}/>} {site.bookingSlug&&<TenantBookingFunnelTracker businessSlug={site.bookingSlug}/>}<PromotionLanding promotion={promotion} business={site} items={categoryIds.size?(items??[]).filter(item=>categoryIds.has(item.category_id)):items??[]} baseBookingUrl="/booking" websiteUrl="/"/></>;
 }
 if(categoryPage)return <>{site.metaPixelId&&<TenantMetaPixel pixelId={site.metaPixelId}/>} {site.bookingSlug&&<TenantBookingFunnelTracker businessSlug={site.bookingSlug}/>}<CategoryLanding page={categoryPage} business={site} items={(items??[]).filter(item=>item.category_id===categoryPage.category_id)} bookingUrl="/booking" websiteUrl="/"/></>;
 if(!locationPage)notFound();
 return <>{site.metaPixelId&&<TenantMetaPixel pixelId={site.metaPixelId}/>} {site.bookingSlug&&<TenantBookingFunnelTracker businessSlug={site.bookingSlug}/>}<LocationLanding page={locationPage} business={site} websiteUrl="/" ctaUrl={site.bookingEnabled?"/booking":"/#contact"} nearbyPages={nearbyPages??[]}/></>;
}
