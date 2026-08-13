export type AdditionalDayPricingType="full_price"|"percentage_discount"|"flat_rate";

export type RentalPricingRules={
 standardRentalHours:number;
 allowMultiDay:boolean;
 additionalDayPricingType:AdditionalDayPricingType;
 additionalDayDiscountPercent:number;
 additionalDayFlatRateCents:number|null;
 maxRentalDays:number|null;
};

export type RentalPricingOverrides={
 standard_rental_hours_override?:number|null;
 allow_multi_day_override?:boolean|null;
 additional_day_pricing_type_override?:AdditionalDayPricingType|null;
 additional_day_discount_percent_override?:number|null;
 additional_day_flat_rate_cents_override?:number|null;
 max_rental_days_override?:number|null;
};

export function resolveRentalPricingRules(business:RentalPricingRules,item:RentalPricingOverrides):RentalPricingRules{
 return {
  standardRentalHours:item.standard_rental_hours_override??business.standardRentalHours,
  allowMultiDay:item.allow_multi_day_override??business.allowMultiDay,
  additionalDayPricingType:item.additional_day_pricing_type_override??business.additionalDayPricingType,
  additionalDayDiscountPercent:item.additional_day_discount_percent_override??business.additionalDayDiscountPercent,
  additionalDayFlatRateCents:item.additional_day_flat_rate_cents_override??business.additionalDayFlatRateCents,
  maxRentalDays:item.max_rental_days_override??business.maxRentalDays,
 };
}

export function calculateRentalDays(start:Date,end:Date,standardRentalHours=24){
 const durationMs=end.getTime()-start.getTime();
 if(!Number.isFinite(durationMs)||durationMs<=0)throw new Error("Choose a valid rental start and end time.");
 return Math.max(1,Math.ceil(durationMs/(Math.max(1,standardRentalHours)*60*60*1000)));
}

export function calculateRentalUnitPrice(basePriceCents:number,days:number,rules:RentalPricingRules){
 if(!Number.isInteger(basePriceCents)||basePriceCents<0||!Number.isInteger(days)||days<1)throw new Error("Rental pricing is invalid.");
 if(days>1&&!rules.allowMultiDay)throw new Error("This rental is limited to one standard rental period.");
 if(rules.maxRentalDays!==null&&days>rules.maxRentalDays)throw new Error(`This rental is limited to ${rules.maxRentalDays} rental days.`);
 let additionalDayUnitPriceCents=basePriceCents;
 if(rules.additionalDayPricingType==="percentage_discount")additionalDayUnitPriceCents=Math.round(basePriceCents*(100-rules.additionalDayDiscountPercent)/100);
 if(rules.additionalDayPricingType==="flat_rate")additionalDayUnitPriceCents=rules.additionalDayFlatRateCents??basePriceCents;
 return {rentalDays:days,baseUnitPriceCents:basePriceCents,additionalDayUnitPriceCents,totalUnitPriceCents:basePriceCents+Math.max(0,days-1)*additionalDayUnitPriceCents};
}

export function rentalPricingMessage(rules:RentalPricingRules){
 if(!rules.allowMultiDay)return "Multi-day rentals unavailable";
 if(rules.additionalDayPricingType==="percentage_discount")return `${rules.additionalDayDiscountPercent}% off each additional rental day`;
 if(rules.additionalDayPricingType==="flat_rate"&&rules.additionalDayFlatRateCents!==null)return `${new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(rules.additionalDayFlatRateCents/100)} each additional rental day`;
 return "Additional rental days available at the standard rate";
}
