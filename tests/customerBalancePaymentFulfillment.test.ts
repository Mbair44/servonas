import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const service=readFileSync(new URL("../lib/financial/customerBalancePaymentFulfillment.ts",import.meta.url),"utf8");
const webhook=readFileSync(new URL("../app/api/stripe/webhook/route.ts",import.meta.url),"utf8");
test("payment-link balance fulfillment posts a Stripe ledger payment through canonical invoice reconciliation",()=>{assert.match(service,/provider_payment_intent_id:paymentIntentId/);assert.match(service,/reconcile_invoice_online_payment/);assert.match(service,/balance_charge_scheduled_for:null/);assert.match(service,/customer_balance_payment_fulfilled/);});
test("payment-link fulfillment is idempotent and preserves Stripe references",()=>{assert.match(service,/provider_payment_intent_id/);assert.match(service,/idempotency_key:`customer-balance/);assert.match(service,/inserted\.error\.code!=="23505"/);assert.match(service,/provider_charge_id/);assert.match(service,/provider_checkout_session_id/);});
test("customer-balance webhook uses the shared fulfillment path rather than direct booking mutation",()=>{assert.match(webhook,/fulfillCustomerBalanceCheckoutPayment/);const branch=webhook.slice(webhook.indexOf('payment_kind==="customer_balance"'),webhook.indexOf('if (bookingId && eventSession.payment_status === "paid")')) ;assert.doesNotMatch(branch,/apply_customer_balance_payment/);});
