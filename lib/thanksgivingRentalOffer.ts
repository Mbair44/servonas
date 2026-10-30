import type {RentalPricingRules} from "@/lib/rentalPricing";

export const THANKSGIVING_RENTAL_OFFER="thanksgiving";
export const COPPER_STATE_BOUNCE_BUSINESS_ID="cb25acc0-3623-4c06-9041-89a88f4ad6ed";

const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const dateValue=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const fourthThursday=(year:number)=>{const first=new Date(year,10,1);return new Date(year,10,1+((4-first.getDay()+7)%7)+21);};

export function thanksgivingRentalWindow(year:number){
 const thanksgiving=fourthThursday(year),delivery=new Date(thanksgiving),pickup=new Date(thanksgiving);
 delivery.setDate(delivery.getDate()-1);pickup.setDate(pickup.getDate()+1);
 return {delivery:dateValue(delivery),thanksgiving:dateValue(thanksgiving),pickup:dateValue(pickup)};
}

export function isThanksgivingInflatable(item:{name?:string|null;category?:string|null}){
 return /bounce|slide|combo|obstacle|inflatable/i.test(`${item.name??""} ${item.category??""}`);
}

export function qualifiesForThanksgivingRentalOffer(input:{offer?:unknown;businessId?:string|null;rentalDate:string;rentalEndDate:string;item:{name?:string|null;category?:string|null}}){
 if(input.offer!==THANKSGIVING_RENTAL_OFFER||input.businessId!==COPPER_STATE_BOUNCE_BUSINESS_ID||!datePattern.test(input.rentalDate)||!datePattern.test(input.rentalEndDate)||!isThanksgivingInflatable(input.item))return false;
 const {delivery,pickup}=thanksgivingRentalWindow(Number(input.rentalDate.slice(0,4)));
 return input.rentalDate===delivery&&input.rentalEndDate===pickup;
}

export function thanksgivingOfferPricingRules(rules:RentalPricingRules):RentalPricingRules{
 return {...rules,allowMultiDay:true,additionalDayPricingType:"percentage_discount",additionalDayDiscountPercent:100};
}
