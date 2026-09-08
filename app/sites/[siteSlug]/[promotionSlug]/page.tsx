import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {PromotionLanding} from "@/components/PromotionLanding";
import {CategoryLanding} from "@/components/CategoryLanding";
import {LocationLanding} from "@/components/LocationLanding";
import {TenantMetaPixel} from "@/components/TenantMetaPixel";

export const dynamic="force-dynamic";

export async function generateMetadata({params}:{params:Promise<{siteSlug:string;promotionSlug:string}>}):Promise<Metadata>{
 const {siteSlug,promotionSlug}=await params,db=getSupabaseAdmin();if(!db)return{};
 const {data:website}=await db.from("business_website_settings").select("business_id").ilike("public_slug",siteSlug).eq("status","published").maybeSingle();if(!website)return{};
 const {data:page}=await db.from("business_location_pages").select("page_title,meta_description,og_title,og_description,slug").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("status","published").maybeSingle();if(!page)return{};
 const canonical=`${(process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com").replace(/\/$/,"")}/sites/${encodeURIComponent(siteSlug)}/${page.slug}`;
 return{title:page.page_title,description:page.meta_description,alternates:{canonical},openGraph:{title:page.og_title,description:page.og_description,url:canonical,type:"website"},robots:{index:true,follow:true}};
}

export default async function PublicLandingPage({params}:{params:Promise<{siteSlug:string;promotionSlug:string}>}){
 const {siteSlug,promotionSlug}=await params,db=getSupabaseAdmin();if(!db)notFound();
 const {data:website}=await db.from("business_website_settings").select("business_id,meta_pixel_id").ilike("public_slug",siteSlug).eq("status","published").maybeSingle();if(!website)notFound();
 const metaPixelId=typeof website.meta_pixel_id==="string"&&/^[0-9]{8,24}$/.test(website.meta_pixel_id.trim())?website.meta_pixel_id.trim():null,websiteUrl=`/sites/${encodeURIComponent(siteSlug)}`;
 const [{data:promotion},{data:categoryPage},{data:locationPage},{data:nearbyPages},{data:business},{data:items},{data:services},{data:bookingBrand}]=await Promise.all([
  db.from("promotions").select("*,discounts(*)").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("landing_page_enabled",true).maybeSingle(),
  db.from("category_website_pages").select("*").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("status","published").maybeSingle(),
  db.from("business_location_pages").select("*").eq("business_id",website.business_id).ilike("slug",promotionSlug).eq("status","published").maybeSingle(),
  db.from("business_location_pages").select("slug,city,state").eq("business_id",website.business_id).eq("status","published").neq("slug",promotionSlug).limit(6),
  db.from("businesses").select("name,primary_color,phone").eq("id",website.business_id).single(),
  db.from("inventory_items").select("id,name,description,daily_price_cents,image_url,category_id").eq("business_id",website.business_id).eq("active",true),
  db.from("services").select("id,name,description").eq("business_id",website.business_id).eq("active",true).eq("is_deleted",false).order("sort_order"),
 db.from("booking_settings").select("logo_url,brand_color,enabled").eq("business_id",website.business_id).maybeSingle(),
 ]);
 if(!business)notFound();
 const brandedBusiness={...business,logoUrl:bookingBrand?.logo_url??null,primaryColor:bookingBrand?.brand_color??business?.primary_color,services:services??[],rentalItems:(items??[]).map(item=>({...item,imageUrl:item.image_url,dailyPriceCents:item.daily_price_cents}))};
 if(promotion){const categoryIds=new Set((await db.from("promotion_categories").select("category_id").eq("promotion_id",promotion.id)).data?.map(row=>row.category_id)??[]);return <>{metaPixelId&&<TenantMetaPixel pixelId={metaPixelId}/>}<PromotionLanding promotion={promotion} business={brandedBusiness} items={categoryIds.size?(items??[]).filter(item=>categoryIds.has(item.category_id)):items??[]} baseBookingUrl={`/book/${siteSlug}`} websiteUrl={websiteUrl}/></>;}
 if(categoryPage)return <>{metaPixelId&&<TenantMetaPixel pixelId={metaPixelId}/>}<CategoryLanding page={categoryPage} business={brandedBusiness} items={(items??[]).filter(item=>item.category_id===categoryPage.category_id)} bookingUrl={`/book/${siteSlug}`} websiteUrl={websiteUrl}/></>;
 if(!locationPage)notFound();
 return <>{metaPixelId&&<TenantMetaPixel pixelId={metaPixelId}/>}<LocationLanding page={locationPage} business={brandedBusiness} websiteUrl={websiteUrl} ctaUrl={bookingBrand?.enabled?`/book/${siteSlug}`:`${websiteUrl}#contact`} nearbyPages={nearbyPages??[]}/></>;
}
