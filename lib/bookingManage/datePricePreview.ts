import type {SupabaseClient} from "@supabase/supabase-js";
import {resolveRentalItemPrice} from "../rentalDatePricing.ts";
import {validateRentalPromo} from "../discounts.ts";
/** Read-only financial preview. Never writes booking dates, snapshots, or totals. */
export async function previewRentalDateChange(db:SupabaseClient,input:{businessId:string;bookingId:string;rentalDate:string|Date;rentalEndDate:string|Date}){
 const {data:booking,error}=await db.from("bookings").select("id,customer_id,status,rental_starts_at,rental_ends_at,subtotal_cents,discount_cents,total_cents,discount_code,discount_snapshot,booking_items(id,inventory_item_id,quantity,unit_price_cents,duration_adjustment_cents,additional_hours,overnight_selected,option_adjustment_cents,operator_charge_cents,date_pricing_snapshot)").eq("id",input.bookingId).eq("business_id",input.businessId).maybeSingle();
 if(error||!booking)throw new Error("Booking not found.");
 const items=await Promise.all((booking.booking_items??[]).map(async line=>{
  const price=await resolveRentalItemPrice(db,{...input,rentalItemId:line.inventory_item_id,additionalHours:Number(line.additional_hours??0),overnight:Boolean(line.overnight_selected)});
  const oldPrice=Number(line.unit_price_cents)+Number(line.duration_adjustment_cents??0),newPrice=price.finalRentalPriceCents;
  return {bookingItemId:line.id,rentalItemId:line.inventory_item_id,quantity:Number(line.quantity),currentUnitPriceCents:oldPrice,newUnitPriceCents:newPrice,differenceCents:(newPrice-oldPrice)*Number(line.quantity),price,operatorChargeCents:Number(line.operator_charge_cents??0),hasDatePricing:Boolean(price.appliedDateRuleId||line.date_pricing_snapshot?.appliedDateRuleId)};
 }));
 const subtotal=Number(booking.subtotal_cents)+items.reduce((sum,item)=>sum+item.differenceCents,0);
 let discount=Number(booking.discount_cents??0),discountSnapshot=booking.discount_snapshot;
 if(booking.discount_code){
  const promo=await validateRentalPromo(db,{businessId:input.businessId,customerId:booking.customer_id,code:booking.discount_code,items:items.map(item=>({id:item.rentalItemId,quantity:item.quantity,rentalUnitPriceCents:item.price.totalUnitPriceCents,unitPriceCents:item.price.totalUnitPriceCents+item.operatorChargeCents/item.quantity}))});
  if(!promo.ok)throw new Error(`The existing promotion needs review: ${promo.error}`);
  discount=promo.discountCents;discountSnapshot=promo.snapshot;
 }
 const total=Number(booking.total_cents)+(subtotal-Number(booking.subtotal_cents))-(discount-Number(booking.discount_cents??0));
 return {bookingId:booking.id,currentRentalStart:booking.rental_starts_at,currentRentalEnd:booking.rental_ends_at,items,currentTotalCents:Number(booking.total_cents),newTotalCents:total,differenceCents:total-Number(booking.total_cents),newDiscountCents:discount,discountSnapshot,requiresConfirmation:items.some(item=>item.differenceCents!==0)||total!==Number(booking.total_cents),applied:false};
}
