import {calculateDiscount,type DiscountRule,type PricedItem} from "./discounts.ts";

export type PromotionStatus="draft"|"active"|"paused"|"expired"|"sold_out";
export function promotionStatus(row:{status:PromotionStatus;starts_at?:string|null;expires_at?:string|null;usage_limit?:number|null},redemptions:number,now=new Date()):PromotionStatus{
 if(row.status!=="active")return row.status;
 if(row.starts_at&&new Date(row.starts_at)>now)return "draft";
 if(row.expires_at&&new Date(row.expires_at)<=now)return "expired";
 if(row.usage_limit!=null&&redemptions>=row.usage_limit)return "sold_out";
 return "active";
}
export function calculatePromotion(rule:DiscountRule,items:PricedItem[],eligibleIds:Set<string>,limit=1){
 if(rule.tiers?.length)return calculateDiscount(rule,items,eligibleIds);
 const limited=items.map(item=>eligibleIds.has(item.id)?{...item,quantity:Math.min(item.quantity,limit)}:item);
 return calculateDiscount({...rule,applies_to:"selected_items"},limited,eligibleIds);
}
