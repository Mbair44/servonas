import assert from "node:assert/strict";
import test from "node:test";
import {validateEligiblePaymentAllocation} from "../lib/pricing/paymentAllocation.ts";
const base={version:1 as const,flow:"invoice" as const,currency:"USD",expectedPaymentCents:10_000,eligibleChargeCents:9_200,eligibleTaxCents:800,taxSplitStatus:"available" as const,prohibitedTipsCents:0 as const,prohibitedRefundableSecurityDepositCents:0 as const,prohibitedOverpaymentCents:0 as const};
test("fee enabled allocation must reconcile exactly",()=>assert.deepEqual(validateEligiblePaymentAllocation(base),base));
test("prohibited components and partial reconciliation fail closed",()=>{assert.throws(()=>validateEligiblePaymentAllocation({...base,eligibleTaxCents:799}));assert.throws(()=>validateEligiblePaymentAllocation({...base,prohibitedTipsCents:1 as any}));});
test("combined eligible contracts retain an unavailable tax split",()=>assert.equal(validateEligiblePaymentAllocation({...base,flow:"booking_amendment",taxSplitStatus:"unavailable",eligibleChargeCents:null,eligibleTaxCents:null}).taxSplitStatus,"unavailable"));
