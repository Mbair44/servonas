import {calculateDiscount,type DiscountRule,type PricedItem} from "./discounts.ts";

export type PromotionStatus="draft"|"active"|"paused"|"expired"|"sold_out";
export type BuyGetRule={
 type:"buy_get";
 qualifyingItemIds?:string[];
 qualifyingCategoryIds?:string[];
 minimumQualifyingQuantity:number;
 rewardItemIds:string[];
 rewardQuantity:number;
 rewardDiscountType:"percentage"|"fixed";
 rewardDiscountValue:number;
 starts_at?:string|null;
 expires_at?:string|null;
};
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

/** Calculates a Buy X, Get Y offer against the customer's actual cart. It never adds reward inventory. */
export function calculateBuyGetPromotion(rule:BuyGetRule,items:PricedItem[],now=new Date()){
 const valid=Number.isInteger(rule.minimumQualifyingQuantity)&&rule.minimumQualifyingQuantity>0&&Number.isInteger(rule.rewardQuantity)&&rule.rewardQuantity>0&&Number.isSafeInteger(rule.rewardDiscountValue)&&rule.rewardDiscountValue>=0;
 if(!valid)return {ok:false as const,error:"This promotion is misconfigured."};
 if(rule.starts_at&&new Date(rule.starts_at)>now)return {ok:false as const,error:"This promotion is not active yet."};
 if(rule.expires_at&&new Date(rule.expires_at)<=now)return {ok:false as const,error:"This promotion has expired."};
 const qualifying=new Set(rule.qualifyingItemIds??[]);
 const qualifyingQuantity=items.reduce((sum,item)=>sum+(qualifying.has(item.id)?item.quantity:0),0);
 if(qualifyingQuantity<rule.minimumQualifyingQuantity)return {ok:false as const,error:"Add a qualifying rental to unlock this reward.",discountCents:0,rewardQuantity:0};
 const rewards=new Set(rule.rewardItemIds), rewardQuantity=items.reduce((sum,item)=>sum+(rewards.has(item.id)?item.quantity:0),0),freeQuantity=Math.min(rule.rewardQuantity,rewardQuantity);
 const rewardBase=items.filter(item=>rewards.has(item.id)).reduce((sum,item)=>sum+item.unitPriceCents*Math.min(item.quantity,rule.rewardQuantity),0);
 const discountCents=Math.min(rewardBase,rule.rewardDiscountType==="percentage"?Math.round(rewardBase*rule.rewardDiscountValue/100):rule.rewardDiscountValue);
 return {ok:true as const,discountCents,rewardQuantity:freeQuantity,qualifyingQuantity};
}
