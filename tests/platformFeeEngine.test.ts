import assert from "node:assert/strict";
import test from "node:test";
import { eligibleAllocation, platformFeeCollectionEnabled } from "../lib/pricing/platformFeeEngine.ts";
import { platformFeeCents } from "../lib/pricing/catalog.ts";

test("mixed payment allocation excludes tips refundable deposits and overpayment",()=>{
 const allocation=eligibleAllocation({chargedAmountCents:25_000,tipsCents:1_000,refundableSecurityDepositCents:5_000,overpaymentCents:500});
 assert.deepEqual(allocation,{eligibleAmountCents:18_500,excludedAmountCents:6_500,reason:"mixed_payment_snapshot"});
 assert.equal(platformFeeCents(allocation.eligibleAmountCents,9_900),555);
});
test("invalid allocation fails closed",()=>assert.throws(()=>eligibleAllocation({chargedAmountCents:100,overpaymentCents:101})));
test("collection is disabled unless explicitly test mode",()=>{const prior=process.env.SERVONAS_PLATFORM_FEE_TEST_MODE;delete process.env.SERVONAS_PLATFORM_FEE_TEST_MODE;assert.equal(platformFeeCollectionEnabled(),false);if(prior)process.env.SERVONAS_PLATFORM_FEE_TEST_MODE=prior;});
