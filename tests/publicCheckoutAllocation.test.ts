import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../app/api/checkout/route.ts",import.meta.url),"utf8");
test("public checkout persists and associates allocation around Stripe Checkout",()=>{
 assert.match(source,/persistPaymentAllocation\(supabase/);
 assert.match(source,/associatePaymentAllocationCheckout\(supabase/);
 assert.match(source,/idempotencyKey:checkoutPaymentKey/);
 assert.ok(source.indexOf("persistPaymentAllocation(supabase")<source.indexOf("stripe.checkout.sessions.create"));
});
test("public checkout allocation derives from finalized server totals",()=>{
 assert.match(source,/depositCents\*taxCents/);
 assert.match(source,/expectedPaymentCents:depositCents/);
 assert.match(source,/prohibitedTipsCents:0/);
});
