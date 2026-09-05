import {notFound} from "next/navigation";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {loadPublishedBusinessWebsiteByDomain} from "@/lib/businessWebsite";
import {PromotionLanding} from "@/components/PromotionLanding";
import {CategoryLanding} from "@/components/CategoryLanding";
import {TenantMetaPixel} from "@/components/TenantMetaPixel";

export const dynamic="force-dynamic";

export default async function DomainLandingPage({params}:{params:Promise<{domain:string;promotionSlug:string}>}){
 const {domain,promotionSlug}=await params;
 const [record,db]=await Promise.all([loadPublishedBusinessWebsiteByDomain(domain,"/sites/domain/[domain]"),Promise.resolve(getSupabaseAdmin())]);
 if(!db||record.kind!=="ok")notFound();
 const site=record.site,businessId=record.settings.business_id;
 const [{data:promotion},{data:categoryPage},{data:items}]=await Promise.all([
  db.from("promotions").select("*,discounts(*)").eq("business_id",businessId).ilike("slug",promotionSlug).eq("landing_page_enabled",true).maybeSingle(),
  db.from("category_website_pages").select("*").eq("business_id",businessId).ilike("slug",promotionSlug).eq("status","published").maybeSingle(),
  db.from("inventory_items").select("id,name,description,daily_price_cents,image_url,category_id").eq("business_id",businessId).eq("active",true),
 ]);
 if(promotion){
  const {data:categories}=await db.from("promotion_categories").select("category_id").eq("promotion_id",promotion.id);
  const categoryIds=new Set((categories??[]).map(row=>row.category_id));
  return <>{site.metaPixelId&&<TenantMetaPixel pixelId={site.metaPixelId}/>}<PromotionLanding promotion={promotion} business={site} items={categoryIds.size?(items??[]).filter(item=>categoryIds.has(item.category_id)):items??[]} baseBookingUrl="/booking"/></>;
 }
 if(!categoryPage)notFound();
 return <>{site.metaPixelId&&<TenantMetaPixel pixelId={site.metaPixelId}/>}<CategoryLanding page={categoryPage} business={site} items={(items??[]).filter(item=>item.category_id===categoryPage.category_id)} bookingUrl="/booking"/></>;
}
