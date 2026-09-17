import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {rentalCompletionBalance} from "../lib/financial/rentalCompletionBalance.ts";
import {bookingBalanceAfterDeliveryChange,bookingBalanceForTotal} from "../lib/financial/bookingBalance.ts";

test("job price increases recalculate the booking balance from total minus paid",()=>{
 assert.deepEqual(bookingBalanceForTotal(15000,5000),{totalCents:15000,balanceDueCents:10000});
});

test("job price decreases recalculate the booking balance from total minus paid",()=>{
 assert.deepEqual(bookingBalanceForTotal(8000,5000),{totalCents:8000,balanceDueCents:3000});
});

test("a price below the amount already paid never creates a negative balance",()=>{
 assert.deepEqual(bookingBalanceForTotal(4000,5000),{totalCents:4000,balanceDueCents:0});
});

test("an unchanged booking total keeps the same remaining balance",()=>{
 assert.deepEqual(bookingBalanceForTotal(10000,5000),{totalCents:10000,balanceDueCents:5000});
});

test("delivery fee and its tax adjust total while preserving payments",()=>{
 assert.deepEqual(bookingBalanceAfterDeliveryChange({totalCents:10000,amountPaidCents:5000,oldDeliveryFeeCents:1000,newDeliveryFeeCents:2000,oldTaxCents:80,newTaxCents:160}),{totalCents:11080,balanceDueCents:6080});
});

test("a discounted rental keeps its remaining deposit balance at completion",()=>{
 const balance=rentalCompletionBalance({subtotalCents:15000,totalCents:7500,discountCents:7500,amountPaidCents:3750,balanceDueCents:3750});
 assert.deepEqual(balance,{subtotalCents:15000,totalCents:7500,discountCents:7500,amountPaidCents:3750,balanceDueCents:3750});
});

test("a standard 50 percent deposit leaves the other 50 percent to invoice",()=>{
 const balance=rentalCompletionBalance({subtotalCents:15000,totalCents:15000,discountCents:0,amountPaidCents:7500,balanceDueCents:7500});
 assert.equal(balance.balanceDueCents,7500);
});

test("completion billing uses the post-discount total only once and surfaces failures",async()=>{
 const [billing,jobs,tech,checkout,webhook,migration,bookingClient]=await Promise.all([
  readFile(new URL("../lib/financial/recurringBilling.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/app/[businessSlug]/jobs/actions.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/tech/actions.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/api/checkout/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/api/stripe/webhook/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../supabase/migrations/20260906000200_rental_completion_autopay.sql",import.meta.url),"utf8"),
  readFile(new URL("../components/PartyRentalBookingClient.tsx",import.meta.url),"utf8"),
 ]);
 assert.match(billing,/rentalCompletionBalance/);
 assert.doesNotMatch(billing,/total_cents\|\|0\)-discount/);
 assert.match(jobs,/remaining-balance invoice could not be finalized/);
 assert.match(jobs,/Job completed and the remaining balance was paid/);
 assert.match(jobs,/billing\.action==="payment_failed"/);
 assert.match(jobs,/bookingBalanceForTotal/);
 assert.doesNotMatch(jobs,/total_amount:Number\(job\.total_amount\)/);
 assert.match(tech,/remaining-balance invoice needs office attention/);
 assert.match(checkout,/customer_creation:"always"/);
 assert.match(checkout,/setup_future_usage:"off_session"/);
 assert.match(checkout,/finalPaymentAccepted/);
 assert.match(webhook,/final_payment_authorized_at/);
 assert.match(webhook,/payment_intent\.payment_method/);
 assert.match(billing,/rental_completion_autopay/);
 assert.match(billing,/off_session:true/);
 assert.match(migration,/stripe_payment_method_id text/);
 assert.match(bookingClient,/name="finalPaymentAccepted" value=\{checkoutAgreementAccepted\?"true":"false"\}/);
 assert.match(bookingClient,/Book & pay \$\{money\(deposit\)\}/);
});
