import {loadPromotionEligibility,filterPromotionInventory} from "@/lib/promotionEligibility";
import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {PromotionLanding} from "@/components/PromotionLanding";
import {CategoryLanding} from "@/components/CategoryLanding";
import {LocationLanding} from "@/components/LocationLanding";
import {TenantMetaPixel} from "@/components/TenantMetaPixel";
import {TenantBookingFunnelTracker} from "@/components/TenantBookingFunnelTracker";
import {hostedTenantRobots,tenantMetadata,tenantCanonicalUrl,publicSeoPlatformUrl} from "@/lib/publicTenantSeo";
import {TenantLandingSchema} from "@/components/TenantPublicSchema";

export const dynamic="force-dynamic";

export async function generateMetadata({params}:{params:Promise<{siteSlug:string;promotionSlug:string}>}):Promise<Metadata>{
 const {siteSlug,promotionSlug}=await params,db=getSupabaseAdmin();if(!db)return{};
 const {data:website}=await db.from("business_website_settings").select("business_id,custom_domain,domain_status").ilike("public_slug",siteSlug).eq("status","published").maybeSingle();if(!website)return{};
 const [location,category,promotion]=await Promise.all([db.from("business_location_pages").select("page_title,meta_description,og_title,og_description,slug").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("status","published").maybeSingle(),db.from("category_website_pages").select("title,intro,seo_title,meta_description,slug").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("status","published").maybeSingle(),db.from("promotions").select("headline,subheadline,slug").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("status","active").eq("landing_page_enabled",true).maybeSingle()]);const fallback=`${publicSeoPlatformUrl}/sites/${encodeURIComponent(siteSlug)}`,index=hostedTenantRobots(website).index;if(location.data)return tenantMetadata({settings:website,fallbackBase:fallback,path:`/${location.data.slug}`,title:location.data.page_title,description:location.data.meta_description,index,openGraphTitle:location.data.og_title,openGraphDescription:location.data.og_description});if(category.data)return tenantMetadata({settings:website,fallbackBase:fallback,path:`/${category.data.slug}`,title:category.data.seo_title||category.data.title,description:category.data.meta_description||category.data.intro,index});if(promotion.data)return tenantMetadata({settings:website,fallbackBase:fallback,path:`/${promotion.data.slug}`,title:promotion.data.headline,description:promotion.data.subheadline||"Check availability and book online.",index});return{};
}

export default async function PublicLandingPage({params}:{params:Promise<{siteSlug:string;promotionSlug:string}>}){
 const {siteSlug,promotionSlug}=await params,db=getSupabaseAdmin();if(!db)notFound();
 const {data:website}=await db.from("business_website_settings").select("business_id,meta_pixel_id,google_reviews,photo_urls,request_service_enabled,booking_enabled,custom_domain,domain_status").ilike("public_slug",siteSlug).eq("status","published").maybeSingle();if(!website)notFound();
 const metaPixelId=typeof website.meta_pixel_id==="string"&&/^[0-9]{8,24}$/.test(website.meta_pixel_id.trim())?website.meta_pixel_id.trim():null,websiteUrl=`/sites/${encodeURIComponent(siteSlug)}`;
 const [{data:promotion},{data:categoryPage},{data:locationPage},{data:nearbyPages},{data:business},{data:items},{data:services},{data:bookingBrand}]=await Promise.all([
  db.from("promotions").select("*,discounts(*)").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("landing_page_enabled",true).maybeSingle(),
  db.from("category_website_pages").select("*").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("status","published").maybeSingle(),
  db.from("business_location_pages").select("*").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("status","published").maybeSingle(),
  db.from("business_location_pages").select("slug,city,state").eq("business_id",website.business_id).eq("status","published").neq("slug",promotionSlug).limit(6),
  db.from("businesses").select("name,primary_color,phone,industry_profile").eq("id",website.business_id).single(),
  db.from("inventory_items").select("id,name,category,description,daily_price_cents,image_url,category_id").eq("business_id",website.business_id).eq("active",true),
  db.from("services").select("id,name,description").eq("business_id",website.business_id).eq("active",true).eq("is_deleted",false).order("sort_order"),
 db.from("booking_settings").select("logo_url,brand_color,enabled").eq("business_id",website.business_id).maybeSingle(),
 ]);
 if(!business)notFound();
 const brandedBusiness={...business,industryProfile:business.industry_profile,logoUrl:bookingBrand?.logo_url??null,primaryColor:bookingBrand?.brand_color??business?.primary_color,bookingEnabled:Boolean(bookingBrand?.enabled),requestEnabled:website.request_service_enabled!==false,googleReviews:Array.isArray(website.google_reviews)?website.google_reviews:[],photoUrls:Array.isArray(website.photo_urls)?website.photo_urls.filter((url):url is string=>typeof url==="string"&&Boolean(url)):[],services:services??[],rentalItems:(items??[]).map(item=>({...item,imageUrl:item.image_url,dailyPriceCents:item.daily_price_cents}))};
 const canonicalBase=tenantCanonicalUrl(website,"/",`${publicSeoPlatformUrl}/sites/${encodeURIComponent(siteSlug)}`);
 if(promotion){const eligibility=await loadPromotionEligibility(db,website.business_id,promotion.discount_id);return <><TenantLandingSchema type="WebPage" name={promotion.headline} url={tenantCanonicalUrl(website,`/${promotion.slug}`,`${publicSeoPlatformUrl}/sites/${encodeURIComponent(siteSlug)}`)} homeUrl={canonicalBase}/>{metaPixelId&&<TenantMetaPixel pixelId={metaPixelId}/>}<TenantBookingFunnelTracker businessSlug={siteSlug} landingType="promotion" landingId={promotion.id} landingLabel={promotion.slug}/><PromotionLanding promotion={promotion} business={brandedBusiness} items={filterPromotionInventory(items??[],promotion.discounts.applies_to,eligibility.eligibleIds)} baseBookingUrl={`/book/${siteSlug}`} websiteUrl={websiteUrl}/></>;}
 if(categoryPage)return <><TenantLandingSchema type="CollectionPage" name={categoryPage.title} url={tenantCanonicalUrl(website,`/${categoryPage.slug}`,`${publicSeoPlatformUrl}/sites/${encodeURIComponent(siteSlug)}`)} homeUrl={canonicalBase}/>{metaPixelId&&<TenantMetaPixel pixelId={metaPixelId}/>}<TenantBookingFunnelTracker businessSlug={siteSlug} landingType="category" landingId={categoryPage.category_id} landingLabel={categoryPage.slug}/><CategoryLanding page={categoryPage} business={brandedBusiness} items={(items??[]).filter(item=>item.category_id===categoryPage.category_id)} bookingUrl={`/book/${siteSlug}`} websiteUrl={websiteUrl}/></>;
 if(!locationPage)notFound();
 return <>{metaPixelId&&<TenantMetaPixel pixelId={metaPixelId}/>}<TenantBookingFunnelTracker businessSlug={siteSlug} landingType="location" landingId={locationPage.id} landingLabel={locationPage.slug}/><LocationLanding page={locationPage} business={brandedBusiness} websiteUrl={websiteUrl} ctaUrl={bookingBrand?.enabled?`/book/${siteSlug}`:`${websiteUrl}#contact`} nearbyPages={nearbyPages??[]}/></>;
}
