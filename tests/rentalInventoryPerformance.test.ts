import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {rentalInventoryPerformance} from "../lib/rentalInventoryPerformance.ts";

test("calculates progress, remaining cost, paid rentals, and average revenue",()=>{
 const result=rentalInventoryPerformance({purchaseCostCents:350000,lifetimeRevenueCents:285000,paidRentals:14});
 assert.equal(result.breakEvenPercent,81);
 assert.equal(result.remainingCents,65000);
 assert.equal(result.averageRevenueCents,20357);
 assert.equal(result.paidForItself,false);
});

test("caps visual progress while preserving revenue above purchase cost",()=>{
 const result=rentalInventoryPerformance({purchaseCostCents:350000,lifetimeRevenueCents:542000,paidRentals:27});
 assert.equal(result.progressPercent,100);
 assert.equal(result.revenueAboveCostCents,192000);
 assert.equal(result.averageRevenueCents,20074);
 assert.equal(result.paidForItself,true);
});

test("omits break-even and average calculations when inputs are unavailable",()=>{
 const result=rentalInventoryPerformance({purchaseCostCents:null,lifetimeRevenueCents:0,paidRentals:0});
 assert.equal(result.breakEvenPercent,null);
 assert.equal(result.averageRevenueCents,null);
 assert.equal(result.paidForItself,false);
});

test("performance aggregation recognizes completed paid rentals without non-item charges",async()=>{
 const migration=await readFile(new URL("../supabase/migrations/20260911000100_rental_inventory_performance.sql",import.meta.url),"utf8");
 assert.match(migration,/j\.status = 'completed'/);
 assert.match(migration,/count\(distinct booking_id\) filter \(where recognized_revenue_cents > 0\)/);
 assert.match(migration,/booking_discount_cents/);
 assert.match(migration,/amount_refunded_cents/);
 assert.doesNotMatch(migration,/delivery_fee_cents|tax_cents|operator_charge_cents/);
});

test("rental inventory page exposes the compact performance card",async()=>{
 const page=await readFile(new URL("../app/app/[businessSlug]/rental-inventory/page.tsx",import.meta.url),"utf8");
 assert.match(page,/RentalPerformanceCard/);
 assert.match(page,/Lifetime revenue/);
 assert.match(page,/Paid rentals/);
 assert.match(page,/Add purchase cost to track break-even/);
});
