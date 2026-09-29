/** Missing amounts are unknown, never implicitly free. Numeric database strings are accepted. */
export function finiteNumber(value:unknown):number|null{
 if(value==null||typeof value==='boolean'||(typeof value!=='number'&&typeof value!=='string')||(typeof value==='string'&&!value.trim()))return null;
 const number=Number(value);return Number.isFinite(number)?number:null;
}
export function centsValue(value:unknown):number|null{
 const number=finiteNumber(value);return number!==null&&Number.isSafeInteger(number)?number:null;
}
export function publicMoney(value:unknown):string{
 const cents=centsValue(value);return cents===null?'Price unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
}
export function normalizePublicRentalPrice(price:Record<string,any>){
 const baseUnitPriceCents=centsValue(price.baseUnitPriceCents??price.dateAdjustedBasePriceCents);
 const totalUnitPriceCents=centsValue(price.totalUnitPriceCents),additionalDayUnitPriceCents=centsValue(price.additionalDayUnitPriceCents),rentalDays=finiteNumber(price.rentalDays);
 if(baseUnitPriceCents===null||baseUnitPriceCents<0||totalUnitPriceCents===null||totalUnitPriceCents<0||additionalDayUnitPriceCents===null||additionalDayUnitPriceCents<0||rentalDays===null||!Number.isSafeInteger(rentalDays)||rentalDays<1)throw new Error('Rental prices could not be verified. Please refresh and try again.');
 return {...price,baseUnitPriceCents,totalUnitPriceCents,additionalDayUnitPriceCents,rentalDays};
}
export function requirePublicAmounts(value:Record<string,unknown>,keys:string[]){
 for(const key of keys){const cents=centsValue(value[key]);if(cents===null||cents<0)throw new Error('Pricing could not be verified. Please try again.');}
}
