import {notFound} from "next/navigation";
import {WorkspaceNav} from "../../../../WorkspaceNav";
import {requireWorkspace} from "@/lib/workspace";
import {canManageBusiness} from "@/lib/access";
import {PromotionLanding} from "@/components/PromotionLanding";
import {filterPromotionInventory,loadPromotionEligibility} from "@/lib/promotionEligibility";

/** Private draft preview. Public promotion routes remain active-only. */
export default async function PromotionPreview({params}:{params:Promise<{businessSlug:string;promotionId:string}>}){
 const {businessSlug,promotionId}=await params;
 const {supabase,business,role}=await requireWorkspace(businessSlug);
 if(!canManageBusiness(role))notFound();
 const [{data:promotion},{data:items},{data:bookingBrand}]=await Promise.all([
  supabase.from("promotions").select("*,discounts(*)").eq("business_id",business.id).eq("id",promotionId).maybeSingle(),
  supabase.from("inventory_items").select("id,name,category,description,daily_price_cents,image_url,category_id").eq("business_id",business.id).eq("active",true),
  supabase.from("booking_settings").select("logo_url,brand_color").eq("business_id",business.id).maybeSingle(),
 ]);
 if(!promotion?.discounts)notFound();
 const eligibility=await loadPromotionEligibility(supabase,business.id,promotion.discount_id);
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><PromotionLanding promotion={promotion} business={{name:business.name,primaryColor:bookingBrand?.brand_color??business.primary_color,logoUrl:bookingBrand?.logo_url??null}} items={filterPromotionInventory(items??[],promotion.discounts.applies_to,eligibility.eligibleIds)} baseBookingUrl={`/book/${businessSlug}`} websiteUrl={`/app/${businessSlug}/marketing/promotions`} previewMode/></section></main>;
}
