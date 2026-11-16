import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingIdPattern,
  canUseStripeCheckoutDiagnostics,
  inspectStoredCheckoutSession,
  stripeDiagnosticErrorStatus,
} from "../lib/stripeCheckoutDiagnostics.ts";

const platformAdmin = (user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined) =>
  Boolean(user?.email_confirmed_at && user.email === "admin@servonas.com");

test("rejects tenant users and disabled diagnostics", () => {
  const platformUser = { email: "admin@servonas.com", email_confirmed_at: "2026-11-16T00:00:00Z" };
  assert.equal(canUseStripeCheckoutDiagnostics(platformUser, platformAdmin, { STRIPE_CHECKOUT_DIAGNOSTICS_ENABLED: "false" }), false);
  assert.equal(canUseStripeCheckoutDiagnostics({ email: "owner@example.com", email_confirmed_at: "2026-11-16T00:00:00Z" }, platformAdmin, { STRIPE_CHECKOUT_DIAGNOSTICS_ENABLED: "true" }), false);
  assert.equal(canUseStripeCheckoutDiagnostics(platformUser, platformAdmin, { STRIPE_CHECKOUT_DIAGNOSTICS_ENABLED: "true" }), true);
});

test("accepts only a Servonas booking UUID, not provider identifiers", () => {
  assert.equal(bookingIdPattern.test("bdc2c730-772c-48a3-bcf5-d35179c745cc"), true);
  assert.equal(bookingIdPattern.test("cs_live_secret"), false);
  assert.equal(bookingIdPattern.test("acct_123"), false);
});

test("returns an allow-listed diagnostic for an expired session without a PaymentIntent", async () => {
  const diagnostic = await inspectStoredCheckoutSession({
    booking: { bookingNumber: 108, bookingStatus: "expired", checkoutSessionId: "cs_test_never_returned" },
    connectedAccountId: "acct_from_booking_business_only",
    retrieveSession: async () => ({ status: "expired", payment_status: "unpaid", created: 1_794_000_000, expires_at: 1_794_001_800, amount_total: 16_250, payment_intent: null }),
    retrievePaymentIntent: async () => { throw new Error("must not retrieve without an intent"); },
  });
  assert.deepEqual(diagnostic, {
    bookingNumber: 108, bookingStatus: "expired", checkoutSessionStatus: "expired", paymentStatus: "unpaid",
    checkoutCreatedAt: "2026-11-06T21:20:00.000Z", checkoutExpiresAt: "2026-11-06T21:50:00.000Z",
    checkoutAmountCents: 16_250, paymentIntentExists: false, paymentIntentStatus: null, paymentFailureCode: null,
  });
  assert.deepEqual(Object.keys(diagnostic).sort(), ["bookingNumber", "bookingStatus", "checkoutAmountCents", "checkoutCreatedAt", "checkoutExpiresAt", "checkoutSessionStatus", "paymentFailureCode", "paymentIntentExists", "paymentIntentStatus", "paymentStatus"].sort());
});

test("reports only a sanitized PaymentIntent failure code", async () => {
  const diagnostic = await inspectStoredCheckoutSession({
    booking: { bookingNumber: 109, bookingStatus: "expired", checkoutSessionId: "cs_test" }, connectedAccountId: "acct_bound",
    retrieveSession: async () => ({ status: "expired", payment_status: "unpaid", created: 1_794_000_000, expires_at: 1_794_001_800, amount_total: 16_250, payment_intent: "pi_test" }),
    retrievePaymentIntent: async () => ({ status: "requires_payment_method", last_payment_error: { code: "card_declined", message: "never expose this" } }),
  });
  assert.equal(diagnostic.paymentIntentExists, true);
  assert.equal(diagnostic.paymentIntentStatus, "requires_payment_method");
  assert.equal(diagnostic.paymentFailureCode, "card_declined");
  assert.equal(JSON.stringify(diagnostic).includes("never expose this"), false);
});

test("maps provider failures to sanitized HTTP statuses", () => {
  assert.equal(stripeDiagnosticErrorStatus({ statusCode: 404 }), 404);
  assert.equal(stripeDiagnosticErrorStatus({ statusCode: 401 }), 502);
  assert.equal(stripeDiagnosticErrorStatus(new Error("provider details")), 502);
});
