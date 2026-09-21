import {validateRentalPromo} from "@/lib/discounts";
import {calculateRentalCalendarDays,calculateRentalUnitPrice,resolveRentalPricingRules} from "@/lib/rentalPricing";

type AdminDb=any;
export type RentalItemAddition={inventoryItemId:string;quantity:number;options?:{optionId:string;choiceId:string}[]};

/**
 * Service-role boundary for a customer booking amendment.  The caller supplies only
 * listing IDs, quantities, and option selectors; all money values are calculated here
 * or inside the locking RPC.
 */
export async function addRentalItemsToBooking(db:AdminDb,input:{businessId:string;bookingId:string;items:RentalItemAddition[];idempotencyKey:string;changeSource?:"customer_manage_booking"|"staff"|"system"}){
 if(!Array.isArray(input.items)||!input.items.length)throw new Error("Choose at least one rental item.");
 const {data:booking,error:bookingError}=await db.from("bookings").select("id,business_id,customer_id,status,rental_starts_at,rental_ends_at,discount_code,discount_cents,discount_snapshot,booking_items:booking_items(inventory_item_id,quantity,unit_price_cents,operator_charge_cents)").eq("id",input.bookingId).eq("business_id",input.businessId).maybeSingle();
 if(bookingError||!booking)throw new Error("Booking not found.");
 const ids=[...new Set(input.items.map(item=>item.inventoryItemId))];
 if(ids.length!==input.items.length)throw new Error("Each rental can only be added once per change.");
 const [{data:settings,error:settingsError},{data:inventory,error:inventoryError}]=await Promise.all([
  db.from("booking_settings").select("timezone,standard_rental_hours,allow_multi_day_rentals,additional_day_pricing_type,additional_day_discount_percent,additional_day_flat_rate_cents,max_rental_days").eq("business_id",input.businessId).maybeSingle(),
  db.from("inventory_items").select("id,daily_price_cents,standard_rental_hours_override,allow_multi_day_override,additional_day_pricing_type_override,additional_day_discount_percent_override,additional_day_flat_rate_cents_override,max_rental_days_override").eq("business_id",input.businessId).in("id",ids).eq("active",true),
 ]);
 if(settingsError||inventoryError||!settings||!inventory||inventory.length!==ids.length)throw new Error("One or more selected rentals are no longer available.");
 const start=new Date(booking.rental_starts_at),end=new Date(booking.rental_ends_at);
 if(Number.isNaN(start.valueOf())||Number.isNaN(end.valueOf()))throw new Error("The booking rental window is invalid.");
 const localDate=(value:Date)=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:settings.timezone??"America/Phoenix",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);const byType=new Map(parts.map(part=>[part.type,part.value]));return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;};
 const days=calculateRentalCalendarDays(localDate(start),localDate(end));
 const byId=new Map<string,any>(inventory.map((item:any)=>[item.id,item]));
 const businessRules={standardRentalHours:Number(settings.standard_rental_hours??24),allowMultiDay:Boolean(settings.allow_multi_day_rentals),additionalDayPricingType:settings.additional_day_pricing_type??"full_price",additionalDayDiscountPercent:Number(settings.additional_day_discount_percent??0),additionalDayFlatRateCents:settings.additional_day_flat_rate_cents==null?null:Number(settings.additional_day_flat_rate_cents),maxRentalDays:settings.max_rental_days==null?null:Number(settings.max_rental_days)} as const;
 const existing=(booking.booking_items??[]).map((line:any)=>({id:line.inventory_item_id,quantity:Number(line.quantity),rentalUnitPriceCents:Number(line.unit_price_cents),unitPriceCents:Number(line.unit_price_cents)+Math.round(Number(line.operator_charge_cents??0)/Math.max(1,Number(line.quantity)))}));
 const additions=input.items.map(item=>{const inventoryItem=byId.get(item.inventoryItemId);if(!inventoryItem)throw new Error("One or more selected rentals are no longer available.");const price=calculateRentalUnitPrice(Number(inventoryItem.daily_price_cents),days,resolveRentalPricingRules(businessRules,inventoryItem));return{id:item.inventoryItemId,quantity:Number(item.quantity),rentalUnitPriceCents:price.totalUnitPriceCents,unitPriceCents:price.totalUnitPriceCents};});
 let discountCents=Number(booking.discount_cents??0),discountSnapshot=booking.discount_snapshot??null;
 if(booking.discount_code){const promo=await validateRentalPromo(db,{businessId:input.businessId,customerId:booking.customer_id??undefined,code:booking.discount_code,items:[...existing,...additions]});if(promo.ok){discountCents=promo.discountCents;discountSnapshot=promo.snapshot;}else{discountCents=0;discountSnapshot=null;}}
 const {data,error}=await db.rpc("add_rental_items_to_booking",{p_business_id:input.businessId,p_booking_id:input.bookingId,p_items:input.items,p_discount_cents:discountCents,p_discount_snapshot:discountSnapshot,p_idempotency_key:input.idempotencyKey,p_change_source:input.changeSource??"customer_manage_booking"});
 if(error)throw new Error(error.message||"Could not update the booking.");
 return data;
}
