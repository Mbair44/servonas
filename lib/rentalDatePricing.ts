import type {SupabaseClient} from "@supabase/supabase-js";
import {dateInTimeZone} from "./bookingTime.ts";
import {applyRentalDatePrice,calculateRentalCalendarDays,resolveRentalPricingRules,resolveRentalDurationRules,rentalDurationAdjustment,type RentalDatePrice,type AdditionalDayPricingType} from "./rentalPricing.ts";

export function rentalPricingDate(value:string|Date,timeZone:string){
 if(value instanceof Date)return dateInTimeZone(value,timeZone);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T12:00:00Z`))||new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)!==value)throw new Error("Choose a valid rental date.");
 // Validate timezone while preserving a date already selected on the business's calendar.
 new Intl.DateTimeFormat("en-US",{timeZone}).format(new Date(`${value}T12:00:00Z`));
 return value;
}
export async function resolveRentalDatePrice(db:SupabaseClient,input:{businessId:string;rentalItemId:string;rentalDate:string|Date;timeZone:string}):Promise<RentalDatePrice>{
 const rentalDate=rentalPricingDate(input.rentalDate,input.timeZone);
 const {data,error}=await db.rpc("resolve_rental_date_price",{p_business_id:input.businessId,p_rental_item_id:input.rentalItemId,p_rental_date:rentalDate});
 if(error||!data)throw new Error(error?.message||"Rental pricing is unavailable. Please retry.");
 if(!Number.isSafeInteger(data.originalBasePriceCents)||!Number.isSafeInteger(data.dateAdjustedBasePriceCents)||data.dateAdjustedBasePriceCents<0||data.rentalDate!==rentalDate)throw new Error("The rental pricing response is invalid.");
 return data as RentalDatePrice;
}
/** Canonical server preview entrypoint; also available to future public/admin UI. */
export async function resolveRentalItemPrice(db:SupabaseClient,input:{businessId:string;rentalItemId:string;rentalDate:string|Date;rentalEndDate?:string|Date;additionalHours?:number;overnight?:boolean}){
 const [{data:item,error:itemError},{data:settings,error:settingsError}]=await Promise.all([
  db.from("inventory_items").select("*").eq("id",input.rentalItemId).eq("business_id",input.businessId).eq("active",true).maybeSingle(),
  db.from("booking_settings").select("*").eq("business_id",input.businessId).maybeSingle(),
 ]);
 if(itemError||settingsError||!item||!settings)throw new Error("Rental pricing is unavailable for this item.");
 const timeZone=settings.timezone??"America/Phoenix",rentalDate=rentalPricingDate(input.rentalDate,timeZone),endDate=rentalPricingDate(input.rentalEndDate??input.rentalDate,timeZone);
 const datePrice=await resolveRentalDatePrice(db,{...input,rentalDate,timeZone});
 const rules=resolveRentalPricingRules({standardRentalHours:Number(settings.standard_rental_hours??24),allowMultiDay:Boolean(settings.allow_multi_day_rentals),additionalDayPricingType:(settings.additional_day_pricing_type??"full_price") as AdditionalDayPricingType,additionalDayDiscountPercent:Number(settings.additional_day_discount_percent??0),additionalDayFlatRateCents:settings.additional_day_flat_rate_cents,maxRentalDays:settings.max_rental_days},item);
 const price=applyRentalDatePrice(datePrice,calculateRentalCalendarDays(rentalDate,endDate),rules);
 const hours=input.additionalHours??0;if(!Number.isInteger(hours)||hours<0||hours>168)throw new Error("Choose valid additional rental hours.");
 const duration=rentalDurationAdjustment(resolveRentalDurationRules({standardRentalHours:rules.standardRentalHours,allowExtendedRental:Boolean(settings.allow_extended_rental),additionalHourPriceCents:Number(settings.additional_hour_price_cents??0),overnightAvailable:Boolean(settings.overnight_available),overnightPriceCents:Number(settings.overnight_price_cents??0)},item),hours,input.overnight===true);
 return {...price,...duration,rules,multiDayAdjustmentCents:price.totalUnitPriceCents-price.dateAdjustedBasePriceCents,finalRentalPriceCents:price.totalUnitPriceCents+duration.durationAdjustmentCents};
}
