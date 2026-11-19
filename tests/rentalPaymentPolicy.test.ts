import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {rentalPublicPaymentPolicy} from "../lib/rentalPaymentPolicy.ts";

const readyAccount={onboarding_status:"complete",charges_enabled:true,payouts_enabled:true};
const incompleteAccount={onboarding_status:"pending",charges_enabled:false,payouts_enabled:false};

test("a deposit-required tenant can use a ready connected Stripe account",()=>{
  const policy=rentalPublicPaymentPolicy({depositPercent:25,stripeSecretConfigured:true,paymentAccount:readyAccount});
  assert.equal(policy.requiresOnlineDeposit,true);
  assert.equal(policy.allowsInvoiceLater,false);
  assert.equal(policy.onlinePaymentsReady,true);
});

test("a deposit-required tenant fails closed when Stripe is missing or Connect is incomplete",()=>{
  const missingSecret=rentalPublicPaymentPolicy({depositPercent:25,stripeSecretConfigured:false,paymentAccount:readyAccount});
  const incompleteConnect=rentalPublicPaymentPolicy({depositPercent:25,stripeSecretConfigured:true,paymentAccount:incompleteAccount});
  assert.equal(missingSecret.requiresOnlineDeposit,true);
  assert.equal(missingSecret.onlinePaymentsReady,false);
  assert.equal(incompleteConnect.requiresOnlineDeposit,true);
  assert.equal(incompleteConnect.onlinePaymentsReady,false);
});

test("a zero-deposit tenant preserves intentional invoice-later behavior without Stripe",()=>{
  const policy=rentalPublicPaymentPolicy({depositPercent:0,stripeSecretConfigured:false,paymentAccount:null});
  assert.equal(policy.requiresOnlineDeposit,false);
  assert.equal(policy.allowsInvoiceLater,true);
  assert.equal(policy.onlinePaymentsReady,false);
});

test("checkout applies tenant payment policy before any reservation mutation and preserves recovery paths",async()=>{
  const [checkout,webhook,connect,depositMigration]=await Promise.all([
    readFile(new URL("../app/api/checkout/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/stripe/webhook/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../lib/stripeConnect.ts",import.meta.url),"utf8"),
    readFile(new URL("../supabase/migrations/20260805000700_party_rental_deposit.sql",import.meta.url),"utf8"),
  ]);
  assert.match(depositMigration,/Zero defers the full balance to an invoice/);
  assert.match(checkout,/rentalPublicPaymentPolicy\(/);
  assert.match(checkout,/paymentPolicy\.requiresOnlineDeposit&&\(paymentAccountError\|\|!paymentPolicy\.onlinePaymentsReady\)/);
  assert.match(checkout,/Online payment is temporarily unavailable for this rental business/);
  assert.ok(checkout.indexOf("paymentPolicy.requiresOnlineDeposit")<checkout.indexOf("create_public_booking_quantities_timed"));
  assert.match(checkout,/\.eq\("business_id",business\.id\)\.eq\("provider","stripe"\)/);
  assert.match(checkout,/await supabase\.from\("bookings"\)\.update\(\{ status: "expired" \}\)/);
  assert.match(webhook,/event\.type === "checkout\.session\.expired"/);
  assert.match(webhook,/\.eq\("status", "pending_payment"\)/);
  assert.match(webhook,/provider_event_id:event\.id/);
  assert.match(webhook,/if\(ledger\.duplicate\)return NextResponse\.json\(\{received:true,duplicate:true\}\)/);
  assert.match(webhook,/confirmed\.data\.business_id!==businessId/);
  assert.match(connect,/onboarding_status==="complete"&&account\.charges_enabled===true&&account\.payouts_enabled===true/);
});
