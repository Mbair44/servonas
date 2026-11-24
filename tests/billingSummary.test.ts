import test from "node:test";
import assert from "node:assert/strict";
import {buildBillingSummary} from "../lib/pricing/billingSummary.ts";

test("billing summary reports a Growth cycle, fee cap, and Stripe cancellation",()=>{
 const summary=buildBillingSummary({planKey:"growth",rolloutEnabled:true,subscription:{status:"active",cancel_at_period_end:true,current_period_ends_at:"2026-12-01T00:00:00Z"},cycle:{cycle_starts_at:"2026-11-01T00:00:00Z",cycle_ends_at:"2026-12-01T00:00:00Z",captured_cents:9_000},eligiblePaymentVolumeCents:300_000});
 assert.equal(summary.monthlyPriceCents,5_000);assert.equal(summary.remainingPlatformFeeCapCents,900);assert.equal(summary.cancelAtPeriodEnd,true);assert.equal(summary.eligiblePaymentVolumeCents,300_000);
});
test("legacy billing summary preserves unmetered behavior",()=>{
 const summary=buildBillingSummary({planKey:"legacy",rolloutEnabled:false,manualBookingUsed:9});
 assert.equal(summary.planKey,"legacy");assert.equal(summary.remainingPlatformFeeCapCents,null);assert.equal(summary.manualBookingLimit,null);assert.equal(summary.monthlyPriceCents,null);
});
