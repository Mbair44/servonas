// Presentation only. Rule choice and amounts always come from the server resolver.
export type RentalPriceDisplay={originalBasePriceCents:number;dateAdjustedBasePriceCents:number;totalUnitPriceCents:number;finalRentalPriceCents:number;rentalDays:number;additionalDayUnitPriceCents:number;durationAdjustmentCents:number;multiDayAdjustmentCents?:number;appliedDateRuleType:string|null;appliedDateRuleName:string|null;rentalDate:string;rentalItemId?:string};
export function rentalPriceLabel(price:Pick<RentalPriceDisplay,"appliedDateRuleType"|"appliedDateRuleName"|"rentalDate">){
 if(price.appliedDateRuleName)return price.appliedDateRuleName;
 if(price.appliedDateRuleType==="specific_date")return "Special date pricing";
 if(price.appliedDateRuleType==="date_range")return "Special pricing";
 if(price.appliedDateRuleType==="day_of_week")return `${new Intl.DateTimeFormat("en-US",{weekday:"long",timeZone:"UTC"}).format(new Date(`${price.rentalDate}T12:00:00Z`))} pricing`;
 return "Standard price";
}
export const rentalMoney=(cents:number)=>Number.isFinite(cents)?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100):"—";
