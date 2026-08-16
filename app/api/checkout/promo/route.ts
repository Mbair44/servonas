import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {validateRentalPromo} from "@/lib/discounts";
import {zonedDateTimeToUtc} from "@/lib/bookingTime";
import {calculateRentalDays,calculateRentalUnitPrice,resolveRentalPricingRules,type AdditionalDayPricingType} from "@/lib/rentalPricing";
import {operatorCharge} from "@/lib/rentalOperators";

export async function POST(request:Request){
 try{
  const body=await request.json(),db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Promo codes are temporarily unavailable."},{status:503});
  const slug=String(body.businessSlug??"").trim(),requested:any[]=Array.isArray(body.items)?body.items:[];
  const {data:settings}=await db.from("booking_settings").select("business_id,timezone,standard_rental_hours,allow_multi_day_rentals,additional_day_pricing_type,additional_day_discount_percent,additional_day_flat_rate_cents,max_rental_days").ilike("public_slug",slug).eq("enabled",true).maybeSingle();if(!settings)return NextResponse.json({error:"Promo code not found."},{status:404});
  const ids=[...new Set(requested.map((item:any)=>String(item.inventoryItemId??"")).filter(Boolean))];
  const {data:items}=await db.from("inventory_items").select("id,daily_price_cents,standard_rental_hours_override,allow_multi_day_override,additional_day_pricing_type_override,additional_day_discount_percent_override,additional_day_flat_rate_cents_override,max_rental_days_override,operator_mode,operator_hourly_rate_cents,operator_default_selected").eq("business_id",settings.business_id).eq("active",true).in("id",ids);if(!items||items.length!==ids.length)return NextResponse.json({error:"One or more selected items are unavailable."},{status:400});
  const start=zonedDateTimeToUtc(String(body.rentalDate),String(body.startTime),settings.timezone??"America/Phoenix"),end=zonedDateTimeToUtc(String(body.rentalEndDate),String(body.endTime),settings.timezone??"America/Phoenix"),businessRules={standardRentalHours:Number(settings.standard_rental_hours??24),allowMultiDay:Boolean(settings.allow_multi_day_rentals),additionalDayPricingType:(settings.additional_day_pricing_type??"full_price") as AdditionalDayPricingType,additionalDayDiscountPercent:Number(settings.additional_day_discount_percent??0),additionalDayFlatRateCents:settings.additional_day_flat_rate_cents==null?null:Number(settings.additional_day_flat_rate_cents),maxRentalDays:settings.max_rental_days==null?null:Number(settings.max_rental_days)};
  const byId=new Map(items.map(item=>[item.id,item]));
  const requestedOperators=new Map<string,boolean>((Array.isArray(body.operators)?body.operators:[]).map((entry:any):[string,boolean]=>[String(entry.inventoryItemId??""),entry.selected===true]));
  const priced=requested.map((entry:any)=>{const item=byId.get(String(entry.inventoryItemId)),quantity=Number(entry.quantity);if(!item||!Number.isInteger(quantity)||quantity<1)throw new Error("Review the selected quantities.");const rules=resolveRentalPricingRules(businessRules,item),days=calculateRentalDays(start,end,rules.standardRentalHours),rental=calculateRentalUnitPrice(item.daily_price_cents,days,rules),operator=operatorCharge(item,start,end,quantity,requestedOperators.get(item.id));return{id:item.id,quantity,unitPriceCents:rental.totalUnitPriceCents+(operator.chargeCents/quantity)};});
  const result=await validateRentalPromo(db,{businessId:settings.business_id,code:String(body.code??""),email:String(body.email??""),items:priced});return NextResponse.json(result,{status:result.ok?200:400});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Promo code could not be checked."},{status:400});}
}
