export type DiscountTier={id:string;minimum_subtotal_cents:number;discount_type:"fixed"|"percentage";discount_value:number};
export const MAX_DISCOUNT_CENTS=2_147_483_647;
export const discountAmountForBase=(tier:Pick<DiscountTier,"discount_type"|"discount_value">,base:number)=>Math.min(base,tier.discount_type==="percentage"?Math.round(base*tier.discount_value/10000):tier.discount_value);
export function validateDiscountTiers(value:unknown,appliesTo="order"):string|null {
 if(!Array.isArray(value))return "Discount tiers must be a list.";
 if(value.length>50)return "Use no more than 50 discount tiers.";
 const ids=new Set<string>(),thresholds=new Set<number>();
 for(const tier of value){
  if(!tier||typeof tier.id!=="string"||!tier.id||tier.id.length>80||ids.has(tier.id))return "Each tier must have a unique ID.";
  if(!Number.isSafeInteger(tier.minimum_subtotal_cents)||tier.minimum_subtotal_cents<0||tier.minimum_subtotal_cents>MAX_DISCOUNT_CENTS)return "Enter a valid minimum rental subtotal for each tier.";
  if(thresholds.has(tier.minimum_subtotal_cents))return "Each tier must have a different minimum rental subtotal.";
  if(!["fixed","percentage"].includes(tier.discount_type)||!Number.isSafeInteger(tier.discount_value)||tier.discount_value<=0||tier.discount_value>(tier.discount_type==="percentage"?10000:MAX_DISCOUNT_CENTS))return "Enter a positive amount or a percentage up to 100% for each tier.";
  ids.add(tier.id);thresholds.add(tier.minimum_subtotal_cents);
 }
 const tiers=[...value].sort((a,b)=>a.minimum_subtotal_cents-b.minimum_subtotal_cents) as DiscountTier[];
 for(let index=1;index<tiers.length;index++){
  const higher=tiers[index],start=appliesTo==="selected_items"?0:higher.minimum_subtotal_cents,end=(tiers[index+1]?.minimum_subtotal_cents??(MAX_DISCOUNT_CENTS+1))-1;
  for(const lower of tiers.slice(0,index)){
   if(higher.discount_type===lower.discount_type&&higher.discount_value<lower.discount_value)return "Higher tiers must not reduce the discount value.";
   // Discount functions are piecewise linear, rounded to cents and capped at the base.
   // Check interval endpoints and both cap transitions (including rounding neighbors).
   const points=[start,end,lower.discount_value,higher.discount_value];
   if(lower.discount_type!==higher.discount_type){
    const fixed=lower.discount_type==="fixed"?lower:higher,percent=lower.discount_type==="percentage"?lower:higher;
    points.push(fixed.discount_value*10000/percent.discount_value);
   }
   for(const point of points)for(const delta of [-1,0,1]){
    const base=Math.max(start,Math.min(end,Math.floor(point)+delta));
    if(discountAmountForBase(higher,base)<discountAmountForBase(lower,base))return "A higher tier would give a smaller discount than a lower tier. Increase its value or adjust the thresholds.";
   }
  }
 }
 return null;
}
export function selectDiscountTier(tiers:DiscountTier[],subtotalCents:number):DiscountTier|null {
 return tiers.reduce<DiscountTier|null>((best,tier)=>tier.minimum_subtotal_cents<=subtotalCents&&(!best||tier.minimum_subtotal_cents>best.minimum_subtotal_cents)?tier:best,null);
}
export function discountTierLabel(tier:DiscountTier):string {
 const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:cents%100?2:0}).format(cents/100);
 return `${tier.discount_type==="percentage"?`${tier.discount_value/100}%`:money(tier.discount_value)} off ${money(tier.minimum_subtotal_cents)}+`;
}
export function parseDiscountTiers(value:FormDataEntryValue|null,appliesTo="order"):DiscountTier[]{
 if(value===null)return [];
 let tiers:unknown;try{tiers=JSON.parse(String(value));}catch{throw new Error("Review the discount tiers.");}
 const error=validateDiscountTiers(tiers,appliesTo);if(error)throw new Error(error);
 return tiers as DiscountTier[];
}
