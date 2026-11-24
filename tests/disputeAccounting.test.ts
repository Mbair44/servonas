import test from "node:test";
import assert from "node:assert/strict";
import {determineDisputeAdjustment} from "../lib/pricing/disputeAccounting.ts";

test("records a proven dispute fee reversal separately from customer refunds",()=>{
 assert.deepEqual(determineDisputeAdjustment({capturedFeeCents:300,customerRefundedFeeCents:75,recordedDisputeNetCents:0,stripeApplicationFeeRefundedCents:180}),{type:"dispute_fee_reversal",amountCents:105});
});
test("records a later Stripe-confirmed dispute fee recovery",()=>{
 assert.deepEqual(determineDisputeAdjustment({capturedFeeCents:300,customerRefundedFeeCents:75,recordedDisputeNetCents:105,stripeApplicationFeeRefundedCents:75}),{type:"dispute_fee_recovery",amountCents:105});
});
test("duplicate or ambiguous webhook evidence creates no duplicate adjustment",()=>{
 assert.equal(determineDisputeAdjustment({capturedFeeCents:300,customerRefundedFeeCents:75,recordedDisputeNetCents:105,stripeApplicationFeeRefundedCents:180}),null);
 assert.throws(()=>determineDisputeAdjustment({capturedFeeCents:300,customerRefundedFeeCents:301,recordedDisputeNetCents:0,stripeApplicationFeeRefundedCents:301}));
});
test("partial customer refunds followed by a dispute preserve separate accounting",()=>{
 assert.deepEqual(determineDisputeAdjustment({capturedFeeCents:99,customerRefundedFeeCents:30,recordedDisputeNetCents:0,stripeApplicationFeeRefundedCents:99}),{type:"dispute_fee_reversal",amountCents:69});
});
