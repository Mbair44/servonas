import test from "node:test";
import assert from "node:assert/strict";
import {applyRentalDatePrice,calculateRentalUnitPrice,rentalDurationAdjustment,type RentalDatePrice,type RentalPricingRules} from "../lib/rentalPricing.ts";
import {rentalPricingDate,resolveRentalDatePrice} from "../lib/rentalDatePricing.ts";
import {validateRentalPriceRule,pricingRuleError} from "../lib/rentalPricingRuleService.ts";
import {calculateDiscount,type DiscountRule} from "../lib/discounts.ts";
const rules:RentalPricingRules={standardRentalHours:24,allowMultiDay:true,additionalDayPricingType:"percentage_discount",additionalDayDiscountPercent:25,additionalDayFlatRateCents:null,maxRentalDays:null};
const datePrice:RentalDatePrice={originalBasePriceCents:22500,dateAdjustedBasePriceCents:27500,appliedDateRuleId:"saturday",appliedDateRuleType:"day_of_week",appliedDateRuleName:null,rentalDate:"2026-10-31",version:1};
test("no rules preserve existing pricing output",()=>{
 const price=applyRentalDatePrice({...datePrice,dateAdjustedBasePriceCents:22500,appliedDateRuleId:null,appliedDateRuleType:null},2,rules);
 const existing=calculateRentalUnitPrice(22500,2,rules);
 for(const key of Object.keys(existing) as (keyof typeof existing)[])assert.equal(price[key],existing[key]);
});
test("start-date price feeds existing multi-day percentage, flat-rate and full-price logic",()=>{
 assert.equal(applyRentalDatePrice(datePrice,2,rules).totalUnitPriceCents,48125);
 assert.equal(applyRentalDatePrice(datePrice,2,{...rules,additionalDayPricingType:"full_price"}).totalUnitPriceCents,55000);
 assert.equal(applyRentalDatePrice(datePrice,2,{...rules,additionalDayPricingType:"flat_rate",additionalDayFlatRateCents:10000}).totalUnitPriceCents,37500);
});
test("civil Saturday stays Saturday in Arizona and UTC instants use the business timezone",()=>{
 assert.equal(rentalPricingDate("2026-10-31","America/Phoenix"),"2026-10-31");
 assert.equal(rentalPricingDate(new Date("2026-11-01T02:00:00Z"),"America/Phoenix"),"2026-10-31");
 assert.equal(rentalPricingDate(new Date("2026-10-30T12:00:00Z"),"Pacific/Auckland"),"2026-10-31");
 assert.throws(()=>rentalPricingDate("2026-02-30","America/Phoenix"));
});
test("the server date resolver delegates to the canonical SQL function and fails closed",async()=>{
 let request:any;
 const db={rpc:async(name:string,args:any)=>{request={name,args};return {data:datePrice,error:null};}};
 assert.deepEqual(await resolveRentalDatePrice(db as any,{businessId:"tenant",rentalItemId:"item",rentalDate:new Date("2026-11-01T02:00:00Z"),timeZone:"America/Phoenix"}),datePrice);
 assert.deepEqual(request,{name:"resolve_rental_date_price",args:{p_business_id:"tenant",p_rental_item_id:"item",p_rental_date:"2026-10-31"}});
 await assert.rejects(resolveRentalDatePrice({rpc:async()=>({error:{message:"Pricing unavailable"}})} as any,{businessId:"tenant",rentalItemId:"item",rentalDate:"2026-10-31",timeZone:"America/Phoenix"}),/unavailable/);
});
test("duration adjustments remain separate and unchanged",()=>{
 const duration=rentalDurationAdjustment({standardRentalHours:24,allowExtendedRental:true,additionalHourPriceCents:1000,overnightAvailable:true,overnightPriceCents:5000},2,true);
 assert.equal(duration.durationAdjustmentCents,7000);
 assert.equal(applyRentalDatePrice(datePrice,1,rules).totalUnitPriceCents+duration.durationAdjustmentCents,34500);
});
test("promotion applies to resolved rental price, not catalog price",()=>{
 const rule:DiscountRule={id:"promo",business_id:"tenant",name:"Fall",code:"FALL",discount_type:"fixed",discount_value:5000,applies_to:"order",minimum_subtotal_cents:null,starts_at:null,expires_at:null,usage_limit:null,per_customer_limit:null,first_time_customer_only:false,is_active:true};
 const price=applyRentalDatePrice(datePrice,1,rules),discount=calculateDiscount(rule,[{id:"item",quantity:1,unitPriceCents:price.totalUnitPriceCents,rentalUnitPriceCents:price.totalUnitPriceCents}],new Set());
 assert.ok(discount.ok);assert.equal(discount.totalCents,22500);assert.equal(discount.discountCents,5000);
});
test("price snapshot is independent from subsequent rule/response changes",()=>{
 const copy={...datePrice},price=applyRentalDatePrice(copy,1,rules);copy.dateAdjustedBasePriceCents=90000;
 assert.equal(price.datePricingSnapshot.dateAdjustedBasePriceCents,27500);
});
test("rule service validates dates and returns actionable database errors",()=>{
 assert.equal(validateRentalPriceRule({rule_type:"specific_date",start_date:"2026-10-31",fixed_price_cents:35000}).end_date,"2026-10-31");
 assert.equal(validateRentalPriceRule({rule_type:"day_of_week",day_of_week:6,fixed_price_cents:0,active:false}).active,false);
 for(const day of [-1,7,1.5])assert.throws(()=>validateRentalPriceRule({rule_type:"day_of_week",day_of_week:day,fixed_price_cents:100}));
 assert.throws(()=>validateRentalPriceRule({rule_type:"date_range",start_date:"2026-11-01",end_date:"2026-10-31",fixed_price_cents:100}));
 assert.match(pricingRuleError({code:"23P01"}),/overlap/);assert.match(pricingRuleError({code:"23505"}),/already exists/);
});
