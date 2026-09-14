"use server";
import {revalidatePath,revalidateTag} from "next/cache";import {redirect} from "next/navigation";import {requireWorkspace} from "@/lib/workspace";import {canManageBusiness} from "@/lib/access";
import {parseDiscountTiers} from "@/lib/discountTiers";
const path=(slug:string)=>`/app/${slug}/marketing/promotions`;
export async function createPromotion(slug:string,data:FormData){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(`${path(slug)}?error=Permission+denied`);
 let tiers;
 try{tiers=parseDiscountTiers(data.get("discountTiers"),"selected_items");}
 catch(error){redirect(`${path(slug)}?error=${encodeURIComponent(error instanceof Error?error.message:"Review the tiers.")}`);}
 const name=String(data.get("name")??"").trim(),rawSlug=String(data.get("slug")??"").trim().toLowerCase(),percent=Number(data.get("percent")),limit=Number(data.get("limit")),categoryIds=[...new Set(data.getAll("categoryId").map(String).filter(Boolean))];
 if(!name||name.length>160||!/^[a-z0-9-]{2,80}$/.test(rawSlug)||(!tiers.length&&(!Number.isFinite(percent)||percent<=0||percent>100))||!categoryIds.length||categoryIds.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))redirect(`${path(slug)}?error=Review+the+promotion+details.`);
 const {error}=await supabase.rpc("save_promotion_draft",{
  p_business_id:business.id,p_name:name,p_slug:rawSlug,
  p_discount_type:tiers[0]?.discount_type??"percentage",p_discount_value:tiers[0]?.discount_value??Math.round(percent*100),p_tiers:tiers,
  p_category_ids:categoryIds,p_usage_limit:Number.isInteger(limit)&&limit>0?limit:null,
  p_headline:String(data.get("headline")??name).trim()||name,p_subheadline:String(data.get("subheadline")??"").trim()||null,
  p_cta_text:String(data.get("cta")??"Claim offer").trim()||"Claim offer",p_terms:String(data.get("terms")??"").trim()||null,
 });
 if(error){
  console.error("Promotion draft save failed",{businessId:business.id,operation:"save_promotion_draft",code:error.code,message:error.message});
  const message=error.code==="PGRST202"||error.code==="42883"?"Promotion saving needs the latest database migration. Apply the promotion category save migration and try again.":error.code==="23505"?"A promotion already uses that page URL or promo code. Choose a different URL.":error.message?.includes("promotion_category_unavailable")?"One or more selected categories are no longer available. Refresh and select the categories again.":error.code==="42501"?"Promotion category permissions are unavailable. Apply the promotion category save migration and verify your owner/admin access.":"The promotion could not be saved. Please try again.";
  redirect(`${path(slug)}?error=${encodeURIComponent(message)}`);
 }
 revalidateTag("public-promotion-inventory");revalidatePath(path(slug));revalidatePath(`/app/${slug}/marketing/discounts`);
 redirect(`${path(slug)}?success=Promotion+draft+saved.`);
}
export async function publishPromotion(slug:string,id:string){const {supabase,business,role}=await requireWorkspace(slug);if(!canManageBusiness(role))redirect(`${path(slug)}?error=Permission+denied`);const {data:promotion}=await supabase.from("promotions").select("discount_id").eq("id",id).eq("business_id",business.id).maybeSingle();if(!promotion)redirect(`${path(slug)}?error=Promotion+not+found.`);await Promise.all([supabase.from("promotions").update({status:"active"}).eq("id",id).eq("business_id",business.id),supabase.from("discounts").update({is_active:true}).eq("id",promotion.discount_id).eq("business_id",business.id)]);revalidateTag("public-promotion-inventory");revalidatePath(path(slug));redirect(`${path(slug)}?success=Promotion+published.`);}

export async function savePromotionCategories(slug:string,promotionId:string,data:FormData){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(`${path(slug)}?error=Permission+denied`);
 const categoryIds=[...new Set(data.getAll("categoryId").map(String).filter(Boolean))];
 if(!categoryIds.length)redirect(`${path(slug)}?error=Choose+at+least+one+eligible+category.`);
 const {error}=await supabase.rpc("set_promotion_categories",{p_business_id:business.id,p_promotion_id:promotionId,p_category_ids:categoryIds});
 if(error){console.error("Promotion category repair failed",{businessId:business.id,promotionId,code:error.code,message:error.message});redirect(`${path(slug)}?error=${encodeURIComponent(error.code==="PGRST202"?"Apply the promotion eligibility repair migration, then save the categories again.":"The categories could not be saved. Verify the category migrations are applied and choose categories belonging to this business.")}`);}
 revalidateTag("public-promotion-inventory");revalidatePath(path(slug));revalidatePath(`/app/${slug}/marketing/discounts`);
 redirect(`${path(slug)}?success=Eligible+categories+saved.+The+existing+promotion+URL+is+ready+to+retry.`);
}
