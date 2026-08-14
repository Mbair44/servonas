import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {calculateRentalDays,calculateRentalUnitPrice,resolveRentalPricingRules,type RentalPricingRules} from "../lib/rentalPricing.ts";

const base:RentalPricingRules={standardRentalHours:24,allowMultiDay:true,additionalDayPricingType:"full_price",additionalDayDiscountPercent:0,additionalDayFlatRateCents:null,maxRentalDays:null};

test("up to 24 hours is one rental day and any excess starts day two",()=>{
 const start=new Date("2026-08-10T15:00:00Z");
 assert.equal(calculateRentalDays(start,new Date("2026-08-11T15:00:00Z"),24),1);
 assert.equal(calculateRentalDays(start,new Date("2026-08-11T15:00:01Z"),24),2);
});

test("full, discounted, and flat additional-day prices use integer cents",()=>{
 assert.equal(calculateRentalUnitPrice(25000,3,base).totalUnitPriceCents,75000);
 assert.equal(calculateRentalUnitPrice(25000,3,{...base,additionalDayPricingType:"percentage_discount",additionalDayDiscountPercent:20}).totalUnitPriceCents,65000);
 assert.equal(calculateRentalUnitPrice(25000,3,{...base,additionalDayPricingType:"flat_rate",additionalDayFlatRateCents:10000}).totalUnitPriceCents,45000);
 assert.equal(calculateRentalUnitPrice(999,2,{...base,additionalDayPricingType:"percentage_discount",additionalDayDiscountPercent:33.33}).additionalDayUnitPriceCents,666);
});

test("item overrides inherit unspecified business rules",()=>{
 const rules=resolveRentalPricingRules(base,{allow_multi_day_override:false,standard_rental_hours_override:12});
 assert.equal(rules.allowMultiDay,false);assert.equal(rules.standardRentalHours,12);assert.equal(rules.additionalDayPricingType,"full_price");
});

test("multi-day and maximum-day rules reject invalid periods",()=>{
 assert.throws(()=>calculateRentalUnitPrice(1000,2,{...base,allowMultiDay:false}),/limited to one/);
 assert.throws(()=>calculateRentalUnitPrice(1000,4,{...base,maxRentalDays:3}),/limited to 3/);
});

test("migration snapshots prices and checks full timestamp intervals",async()=>{
 const sql=await readFile(new URL("../supabase/migrations/20260813000600_party_rental_multi_day_pricing.sql",import.meta.url),"utf8");
 assert.match(sql,/rental_starts_at timestamptz/);assert.match(sql,/rental_days integer/);assert.match(sql,/additional_day_unit_price_cents/);assert.match(sql,/v_end\+make_interval/);assert.match(sql,/v_start/);
});

test("checkout prices before promotions and deposits",async()=>{
 const source=await readFile(new URL("../app/api/checkout/route.ts",import.meta.url),"utf8");
 assert.ok(source.indexOf("calculateRentalUnitPrice(item.daily_price_cents")<source.indexOf("await validateRentalPromo"));
 assert.ok(source.indexOf("discountCents=promo")<source.indexOf("depositCents = Math.round"));
 assert.match(source,/p_rental_end_date/);
});

test("reservation summary itemizes the first period and every additional day",async()=>{
 const source=await readFile(new URL("../components/PartyRentalBookingClient.tsx",import.meta.url),"utf8");
 assert.match(source,/Day 1 · standard rental period/);
 assert.match(source,/Day \{index\+2\} · \{additionalLabel\}/);
 assert.match(source,/additionalDayDiscountPercent/);
 assert.match(source,/additionalDayUnitPriceCents\*quantity/);
});

test("booking catalog follows managed rental category order then item name",async()=>{
 const source=await readFile(new URL("../app/book/[businessSlug]/page.tsx",import.meta.url),"utf8");
 assert.match(source,/rental_inventory_categories/);
 assert.match(source,/categoryOrder/);
 assert.match(source,/a\.rank-b\.rank/);
 assert.match(source,/left\.name\.localeCompare\(right\.name\)/);
});
