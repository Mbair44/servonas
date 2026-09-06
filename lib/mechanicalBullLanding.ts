import type {SupabaseClient} from "@supabase/supabase-js";
import {rentalPricingMessage,resolveRentalPricingRules,type AdditionalDayPricingType} from "./rentalPricing.ts";
import type {OperatorMode} from "./rentalOperators.ts";

export type MechanicalBullLandingData={
 businessId:string;businessName:string;businessSlug:string;phone:string|null;brandColor:string;bookingSlug:string;websiteUrl:string;serviceAreas:string[];
 item:{id:string;name:string;description:string|null;imageUrl:string|null;dailyPriceCents:number;standardRentalHours:number;multiDayMessage:string|null;operatorMode:OperatorMode;operatorHourlyRateCents:number;operatorDefaultSelected:boolean};
};

export async function loadMechanicalBullLandingData(db:SupabaseClient,businessId?:string):Promise<MechanicalBullLandingData|null>{
 let businessQuery=db.from("businesses").select("id,name,slug,phone,primary_color,city,state,website_url,industry_profile").eq("is_deleted",false).eq("industry_profile","party_rental");
 businessQuery=businessId?businessQuery.eq("id",businessId):businessQuery.ilike("name","Copper State Bounce");
 const {data:business}=await businessQuery.maybeSingle();
 if(!business||!business.slug)return null;
 const [{data:settings},{data:website},{data:items},{data:territories}]=await Promise.all([
  db.from("booking_settings").select("public_slug,brand_color,standard_rental_hours,allow_multi_day_rentals,additional_day_pricing_type,additional_day_discount_percent,additional_day_flat_rate_cents,max_rental_days").eq("business_id",business.id).eq("enabled",true).maybeSingle(),
  db.from("business_website_settings").select("public_slug,status,custom_domain,domain_status").eq("business_id",business.id).maybeSingle(),
  db.from("inventory_items").select("id,name,description,daily_price_cents,image_url,standard_rental_hours_override,allow_multi_day_override,additional_day_pricing_type_override,additional_day_discount_percent_override,additional_day_flat_rate_cents_override,max_rental_days_override,operator_mode,operator_hourly_rate_cents,operator_default_selected").eq("business_id",business.id).eq("active",true).ilike("name","%mechanical%bull%").order("name").limit(1),
  db.from("workforce_territories").select("name,postal_codes,neighborhoods,strategy_config").eq("business_id",business.id).eq("is_active",true).order("name"),
 ]);
 const item=items?.[0];
 if(!settings?.public_slug||!item)return null;
 const rules=resolveRentalPricingRules({standardRentalHours:Number(settings.standard_rental_hours??24),allowMultiDay:Boolean(settings.allow_multi_day_rentals),additionalDayPricingType:(settings.additional_day_pricing_type??"full_price") as AdditionalDayPricingType,additionalDayDiscountPercent:Number(settings.additional_day_discount_percent??0),additionalDayFlatRateCents:settings.additional_day_flat_rate_cents==null?null:Number(settings.additional_day_flat_rate_cents),maxRentalDays:settings.max_rental_days==null?null:Number(settings.max_rental_days)},item);
 const areas=[...new Set((territories??[]).flatMap((territory:any)=>[territory.name,...(territory.strategy_config?.cities??[]),...(territory.neighborhoods??[])]).filter(Boolean))].slice(0,12) as string[];
 const fallback=[business.city,business.state].filter(Boolean).join(", ");
 const configuredWebsite=typeof business.website_url==="string"&&business.website_url.trim()?business.website_url.trim():null;
 const websiteUrl=website?.domain_status==="connected"&&website.custom_domain?`https://${website.custom_domain}`:website?.status==="published"&&website.public_slug?`/sites/${encodeURIComponent(website.public_slug)}`:configuredWebsite?/^https?:\/\//i.test(configuredWebsite)?configuredWebsite:`https://${configuredWebsite}`:`/book/${encodeURIComponent(settings.public_slug)}`;
 return {businessId:business.id,businessName:business.name,businessSlug:business.slug,phone:business.phone??null,brandColor:settings.brand_color??business.primary_color??"#e25d26",bookingSlug:settings.public_slug,websiteUrl,serviceAreas:areas.length?areas:(fallback?[fallback]:[]),item:{id:item.id,name:item.name,description:item.description??null,imageUrl:item.image_url??null,dailyPriceCents:Number(item.daily_price_cents??0),standardRentalHours:rules.standardRentalHours,multiDayMessage:rules.allowMultiDay?rentalPricingMessage(rules):null,operatorMode:(item.operator_mode??"none") as OperatorMode,operatorHourlyRateCents:Number(item.operator_hourly_rate_cents??0),operatorDefaultSelected:Boolean(item.operator_default_selected)}};
}

export function mechanicalBullOperatorCopy(item:MechanicalBullLandingData["item"]){
 if(item.operatorMode==="required")return "A professional operator is required under the current rental setup. Any operator charge is calculated for your selected rental time during booking.";
 if(item.operatorMode==="optional")return item.operatorDefaultSelected?"A professional operator is selected by default. You can review the operator option and its price for your rental time during booking.":"A professional operator is available as an option. You can add it and review its price for your rental time during booking.";
 return "This rental follows Copper State Bounce’s current booking configuration. Any available operator options are shown during booking.";
}
