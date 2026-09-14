export const promotionEligibleItemIds=(targets:{inventory_item_id?:string|null}[],categoryItems:{id?:string|null}[])=>new Set([...targets.map(row=>row.inventory_item_id),...categoryItems.map(row=>row.id)].filter((id):id is string=>Boolean(id)));
export function filterPromotionInventory<T extends {id:string}>(items:T[],appliesTo:string,eligibleIds:Set<string>):T[]{
 return appliesTo==="order"?items:items.filter(item=>eligibleIds.has(item.id));
}
export async function loadPromotionEligibility(db:any,businessId:string,discountId:string){
 const [targets,promotion]=await Promise.all([
  db.from("discount_items").select("inventory_item_id").eq("business_id",businessId).eq("discount_id",discountId),
  db.from("promotions").select("id").eq("business_id",businessId).eq("discount_id",discountId).maybeSingle(),
 ]);
 if(targets.error||promotion.error)throw new Error("Promotion eligibility could not be loaded.");
 let categoryItems:{id:string}[]=[];
 if(promotion.data){
  const categories=await db.from("promotion_categories").select("category_id").eq("promotion_id",promotion.data.id);
  if(categories.error)throw new Error("Promotion categories could not be loaded.");
  const categoryIds=[...new Set((categories.data??[]).map((row:any)=>row.category_id).filter(Boolean))];
  if(categoryIds.length){
   const result=await db.from("inventory_items").select("id").eq("business_id",businessId).eq("active",true).in("category_id",categoryIds);
   if(result.error)throw new Error("Promotion rentals could not be loaded.");
   categoryItems=result.data??[];
  }
 }
 return {eligibleIds:promotionEligibleItemIds(targets.data??[],categoryItems),promotionId:promotion.data?.id??null};
}
