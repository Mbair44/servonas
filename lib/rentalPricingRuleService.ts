import type {SupabaseClient} from "@supabase/supabase-js";
import {rentalPricingDate} from "./rentalDatePricing.ts";
export type RentalPriceRuleInput={rule_type:"day_of_week"|"date_range"|"specific_date";name?:string|null;day_of_week?:number|null;start_date?:string|null;end_date?:string|null;fixed_price_cents:number;active?:boolean};
export function validateRentalPriceRule(input:RentalPriceRuleInput){
 if(!["day_of_week","date_range","specific_date"].includes(input.rule_type))throw new Error("Choose a pricing type.");
 if(!Number.isSafeInteger(input.fixed_price_cents)||input.fixed_price_cents<0||input.fixed_price_cents>2147483647)throw new Error("Enter a valid nonnegative price in cents.");
 if(input.active!==undefined&&typeof input.active!=="boolean")throw new Error("Choose whether this price is active.");
 const name=input.name?.trim()||null;if(name&&name.length>120)throw new Error("Use a name of 120 characters or fewer.");
 if(input.rule_type==="day_of_week"){
  if(!Number.isInteger(input.day_of_week)||input.day_of_week!<0||input.day_of_week!>6||input.start_date||input.end_date)throw new Error("Choose a weekday without a date range.");
  return {...input,name,day_of_week:input.day_of_week!,start_date:null,end_date:null,active:input.active??true};
 }
 if(input.day_of_week!=null)throw new Error("Date prices cannot also specify a weekday.");
 const start=rentalPricingDate(input.start_date??"","UTC"),end=input.rule_type==="specific_date"?start:rentalPricingDate(input.end_date??"","UTC");
 if(end<start)throw new Error("End date must be on or after the start date.");
 if(input.rule_type==="specific_date"&&input.end_date&&input.end_date!==start)throw new Error("A specific-date price applies to one date.");
 return {...input,name,day_of_week:null,start_date:start,end_date:end,active:input.active??true};
}
export function pricingRuleError(error:{code?:string;message?:string}){
 if(error.code==="23P01")return "These dates overlap another active special price. Adjust the dates or disable the other price.";
 if(error.code==="23505")return "An active price already exists for this weekday or date. Edit that price instead.";
 return error.message??"The pricing rule could not be saved.";
}
async function assertItem(db:SupabaseClient,businessId:string,itemId:string){
 const {data,error}=await db.from("inventory_items").select("id").eq("id",itemId).eq("business_id",businessId).maybeSingle();
 if(error||!data)throw new Error("Rental item not found in this business.");
}
/** Call with the authenticated workspace client. RLS enforces owner/admin/manager on every operation. */
export async function listRentalPricingRules(db:SupabaseClient,businessId:string,itemId:string){
 await assertItem(db,businessId,itemId);
 const {data,error}=await db.from("rental_item_pricing_rules").select("*").eq("business_id",businessId).eq("rental_item_id",itemId).order("created_at");
 if(error)throw new Error(pricingRuleError(error));return data;
}
export async function saveRentalPricingRule(db:SupabaseClient,businessId:string,itemId:string,input:RentalPriceRuleInput,id?:string){
 await assertItem(db,businessId,itemId);const values=validateRentalPriceRule(input);
 // Whitelist fields: browser input cannot supply ownership, IDs or timestamps.
 const row={rule_type:values.rule_type,name:values.name,day_of_week:values.day_of_week,start_date:values.start_date,end_date:values.end_date,fixed_price_cents:values.fixed_price_cents,active:values.active};
 const query=id?db.from("rental_item_pricing_rules").update(row).eq("id",id).eq("business_id",businessId).eq("rental_item_id",itemId):db.from("rental_item_pricing_rules").insert({...row,business_id:businessId,rental_item_id:itemId});
 const {data,error}=await query.select("*").single();if(error)throw new Error(pricingRuleError(error));return data;
}
export async function deleteRentalPricingRule(db:SupabaseClient,businessId:string,itemId:string,id:string){
 await assertItem(db,businessId,itemId);
 const {data,error}=await db.from("rental_item_pricing_rules").delete().eq("id",id).eq("business_id",businessId).eq("rental_item_id",itemId).select("id").single();
 if(error||!data)throw new Error(error?pricingRuleError(error):"Pricing rule not found.");return {deleted:true};
}
