import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {calculateSmartUpsellPrice} from "../lib/smartUpsells.ts";
import {smartUpsellOfferCanBeginCheckout} from "../lib/smartUpsellCheckout.ts";

const migration=fs.readFileSync("supabase/migrations/20261017000200_smart_upsell_financial_amendments.sql","utf8");
const checkout=fs.readFileSync("lib/smartUpsellCheckout.ts","utf8");
const route=fs.readFileSync("app/api/smart-upsells/[token]/checkout/route.ts","utf8");
const cron=fs.readFileSync("app/api/cron/financial/route.ts","utf8");

test("discounted Smart Upsell deposit and balance reconcile exactly",()=>{
 const price=calculateSmartUpsellPrice({originalPriceCents:18500,discountBasisPoints:5000,depositBasisPoints:5000,taxCents:760,taxSnapshot:{}});
 assert.equal(price.discountedPriceCents,9250);assert.equal(price.depositCents,5005);assert.equal(price.remainingBalanceIncrementCents,5005);
 assert.equal(price.depositCents+price.remainingBalanceIncrementCents,price.discountedPriceCents+price.taxCents);
});
test("staged amendment deposit calculation remains deterministic",()=>{
 const staged=fs.readFileSync("lib/bookingManage/stagedAmendments.ts","utf8");
 assert.match(staged,/Math\.round\(Math\.max\(0,input\.newTotalCents\).*input\.depositPercent\).*\/100\)/);
 assert.match(staged,/requiredPaymentCents=input\.requiredPaymentCents\?\?/);
});
test("financial migration preserves historical tax and blocks automatic tax",()=>{
 assert.match(migration,/coalesce\(v_before\.tax_cents,0\)\+v_added_tax/);
 assert.match(migration,/Automatic tax amendments require address-aware tax reconciliation/);
 assert.match(migration,/auth\.role\(\) <> 'service_role'/);
 assert.match(migration,/booking_change_audit/);
});
test("checkout prepares only internally consistent live offers",()=>{
 const base={status:"sent" as const,expires_at:new Date(Date.now()+60_000).toISOString(),discounted_price_cents:9250,additional_delivery_fee_cents:0,tax_cents:0,deposit_cents:4625,remaining_balance_increment_cents:4625};
 assert.equal(smartUpsellOfferCanBeginCheckout(base),true);
 assert.equal(smartUpsellOfferCanBeginCheckout({...base,remaining_balance_increment_cents:4624}),false);
 assert.equal(smartUpsellOfferCanBeginCheckout({...base,status:"accepted"}),false);
});
test("server route keeps gate before staging and uses existing amendment infrastructure",()=>{
 assert.match(route,/prepareSmartUpsellCheckout/);assert.match(checkout,/assertSmartUpsellCheckoutGate\(offer\)/);
 assert.match(checkout,/stageBookingItemAmendment/);assert.match(checkout,/calculateSmartUpsellTaxCents/);assert.match(checkout,/taxCalculationMethod==="automatic"/);
 assert.match(checkout,/balance_charge_scheduled_for/);assert.match(checkout,/idempotencyKey:`smart-upsell:\$\{offer\.id\}`/);
 assert.match(cron,/booking_amendments/);assert.match(cron,/payment_processing/);
});
