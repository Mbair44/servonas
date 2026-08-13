export type DiscountRule={id:string;business_id:string;name:string;code:string;discount_type:"percentage"|"fixed";discount_value:number;applies_to:"order"|"selected_items";minimum_subtotal_cents:number|null;starts_at:string|null;expires_at:string|null;usage_limit:number|null;per_customer_limit:number|null;first_time_customer_only:boolean;is_active:boolean};
export type PricedItem={id:string;quantity:number;unitPriceCents:number};
export type DiscountEvaluation={ok:true;discountId:string;name:string;code:string;subtotalCents:number;eligibleSubtotalCents:number;discountCents:number;totalCents:number}|{ok:false;error:string};
export const normalizePromoCode=(value:string)=>value.trim().toUpperCase();
export function calculateDiscount(rule:DiscountRule,items:PricedItem[],eligibleIds:Set<string>,now=new Date(),eligibility:{totalUses?:number;customerUses?:number;hasPriorBooking?:boolean}={}):DiscountEvaluation{
 const subtotalCents=items.reduce((sum,item)=>sum+item.quantity*item.unitPriceCents,0);
 if(!rule.is_active)return{ok:false,error:"This promo code is not active."};
 if(rule.starts_at&&new Date(rule.starts_at)>now)return{ok:false,error:"This promo code is not active yet."};
 if(rule.expires_at&&new Date(rule.expires_at)<=now)return{ok:false,error:"This promo code has expired."};
 if(rule.usage_limit!=null&&Number(eligibility.totalUses??0)>=rule.usage_limit)return{ok:false,error:"This promo code has reached its usage limit."};
 if(rule.per_customer_limit!=null&&Number(eligibility.customerUses??0)>=rule.per_customer_limit)return{ok:false,error:"This promo code has already been used the maximum number of times for this customer."};
 if(rule.first_time_customer_only&&eligibility.hasPriorBooking)return{ok:false,error:"This promo code is only available to first-time customers."};
 if(rule.minimum_subtotal_cents!=null&&subtotalCents<rule.minimum_subtotal_cents)return{ok:false,error:"The minimum order amount for this promo code has not been met."};
 const eligibleSubtotalCents=rule.applies_to==="order"?subtotalCents:items.filter(item=>eligibleIds.has(item.id)).reduce((sum,item)=>sum+item.quantity*item.unitPriceCents,0);
 if(eligibleSubtotalCents<=0)return{ok:false,error:"This promo code does not apply to the selected items."};
 const raw=rule.discount_type==="percentage"?Math.round(eligibleSubtotalCents*rule.discount_value/10000):rule.discount_value;
 const discountCents=Math.max(0,Math.min(subtotalCents,eligibleSubtotalCents,raw));
 return{ok:true,discountId:rule.id,name:rule.name,code:normalizePromoCode(rule.code),subtotalCents,eligibleSubtotalCents,discountCents,totalCents:subtotalCents-discountCents};
}

export async function validateRentalPromo(db:any,input:{businessId:string;code:string;items:PricedItem[];email?:string;customerId?:string}){
 const code=normalizePromoCode(input.code);if(!code)return{ok:false as const,error:"Enter a promo code."};
 const {data:rule}=await db.from("discounts").select("*").eq("business_id",input.businessId).eq("normalized_code",code).maybeSingle();
 if(!rule)return{ok:false as const,error:"Promo code not found."};
 const [{data:targets},{count:totalUses}]=await Promise.all([
  db.from("discount_items").select("inventory_item_id").eq("business_id",input.businessId).eq("discount_id",rule.id),
  db.from("discount_redemptions").select("id",{count:"exact",head:true}).eq("discount_id",rule.id).in("status",["pending","redeemed"]),
 ]);
 if(rule.usage_limit!=null&&Number(totalUses??0)>=rule.usage_limit)return{ok:false as const,error:"This promo code has reached its usage limit."};
 let customerId=input.customerId;
 if(!customerId&&input.email){const {data:customer}=await db.from("customers").select("id").eq("business_id",input.businessId).ilike("email",input.email.trim()).eq("is_deleted",false).maybeSingle();customerId=customer?.id;}
 if(customerId&&rule.per_customer_limit!=null){const {count}=await db.from("discount_redemptions").select("id",{count:"exact",head:true}).eq("discount_id",rule.id).eq("customer_id",customerId).in("status",["pending","redeemed"]);if(Number(count??0)>=rule.per_customer_limit)return{ok:false as const,error:"This promo code has already been used the maximum number of times for this customer."};}
 if(rule.first_time_customer_only&&customerId){const {count}=await db.from("bookings").select("id",{count:"exact",head:true}).eq("business_id",input.businessId).eq("customer_id",customerId).in("status",["confirmed","paid","completed"]);if(Number(count??0)>0)return{ok:false as const,error:"This promo code is only available to first-time customers."};}
 return calculateDiscount(rule,input.items,new Set((targets??[]).map((row:any)=>row.inventory_item_id).filter(Boolean)),new Date(),{totalUses:Number(totalUses??0),customerUses:0,hasPriorBooking:false});
}
