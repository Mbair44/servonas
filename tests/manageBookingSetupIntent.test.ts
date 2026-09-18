import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const route = readFileSync(new URL("../app/api/manage-booking/[token]/setup-intent/route.ts", import.meta.url), "utf8");
const confirmRoute = readFileSync(new URL("../app/api/manage-booking/[token]/setup-intent/confirm/route.ts", import.meta.url), "utf8");
test("SetupIntent route recovers a booking-scoped Stripe customer before creation", () => {
  assert.match(route, /ensureBookingStripeCustomer/);
  assert.match(route, /stripeAccount: account\.provider_account_id/);
  assert.match(route, /stripe_customer_recovery_failed/);
});
test("SetupIntent route records only safe diagnostic fields", () => {
  assert.match(route, /finalReasonCode/);
  assert.match(route, /customerRecoveryAttempted/);
  assert.doesNotMatch(route, /console\.info\([^\n]*token/);
});
test("successful SetupIntent confirmation updates only the booking payment method", () => {
  assert.match(confirmRoute, /stripe_payment_method_id: paymentMethodId/);
  assert.match(confirmRoute, /setupIntent\.status !== "succeeded"/);
  assert.match(confirmRoute, /stripeAccount: account\.provider_account_id/);
  assert.doesNotMatch(confirmRoute, /default_payment_method/);
});
