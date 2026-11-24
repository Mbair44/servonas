# Phase E pricing rollout runbook

This runbook is for a controlled **Stripe test-mode** validation. It does not authorize production billing, production migrations, Twilio mutations, phone-number releases, or tenant migrations.

## Preconditions

- Apply migrations in lexical order through `20261123000600_starter_twilio_resource_resolution.sql` to an isolated staging database only.
- Keep every existing tenant on `legacy` with `rollout_enabled = false`. Do not migrate Copper State Bounce.
- Configure only test credentials:
  - `STRIPE_SECRET_KEY=sk_test_...`
  - `STRIPE_WEBHOOK_SECRET` for payment webhooks
  - `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` for subscription webhooks
  - `STRIPE_SERVONAS_GROWTH_PRICE_ID=price_...`
  - `STRIPE_SERVONAS_SCALE_PRICE_ID=price_...`
  - `SERVONAS_PLATFORM_FEE_TEST_MODE=true`
- Configure the Stripe test webhook endpoints for the payment and subscription routes, with their separate signing secrets. Never reuse a live signing secret.
- Keep production activation disabled. The tenant-migration workflow must remain test-mode-only and require an explicit platform-admin confirmation.

## Local preflight

Run the migration harness and the focused suite before touching Stripe:

```bash
bash scripts/test-pricing-migrations.sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \
  tests/pricingFoundation.test.ts tests/platformFeeEngine.test.ts \
  tests/paymentAllocation.test.ts tests/applicationFeeRefunds.test.ts \
  tests/disputeAccounting.test.ts tests/subscriptionPlans.test.ts \
  tests/subscriptionEventOrdering.test.ts tests/billingSummary.test.ts \
  tests/tenantBillingDelivery.test.ts tests/pricingPhaseDFinal.test.ts
node scripts/stripe-pricing-test-mode-preflight.mjs
```

The preflight script makes no network calls. It fails closed if a non-test Stripe key, missing test Price ID, or disabled fee-test flag is supplied.

## Controlled test tenant

1. Create a dedicated non-production tenant in the staging database; do not reuse a legacy customer.
2. Use the platform-admin migration preview. Confirm that the target profile is eligible and that production activation is false.
3. For a Starter transition, resolve every active Twilio number and chargeable resource through the auditable admin workflow. The workflow must be disabled with its explicit confirmation before the transition can complete. Do not release a number automatically.
4. Deliver signed Stripe test webhooks only after the test tenant owns the matching test customer and subscription IDs.

## Stripe test-mode checklist

For each payment path—public checkout, invoice/partial invoice, customer deposit link, managed deposit/balance, Smart Upsell, amendment, and recurring off-session payment—verify all of the following in the staging ledger:

- connected-account context and immutable allocation are present;
- ordinary rental deposits are eligible; tips, refundable security deposits, and overpayments are excluded or rejected;
- application fee is 3% with integer half-up rounding, capped at $99 per billing cycle;
- idempotent retry reuses the reservation; failed/expired payment releases it; webhook capture is exactly once;
- refund reversals are proportional, duplicate-safe, and do not reopen cap capacity;
- legacy tenants create neither a fee reservation nor an application fee.

Exercise subscription changes only through signed test webhooks: Starter to Growth/Scale, Growth/Scale change, cancellation at period end, reactivation, renewal, failed payment, and expiry. Confirm redirects and requested plan metadata alone grant no entitlement. For duplicate and delayed events, confirm receipt uniqueness, authoritative subscription retrieval, and no stale overwrite.

## Monitoring and recovery

- Monitor failed webhook receipts, unresolved `manual_review` dispute records, reservation-expiry reconciliation, and admin pricing-migration audit entries.
- Reconcile Stripe application-fee IDs against `platform_fee_ledger` before enabling any additional test tenant.
- On an incorrect tenant migration, use the platform-admin compensating recovery operation; do not edit entitlement rows manually.
- On a payment uncertainty, leave the reservation/reconciliation evidence intact and resolve it through the reconciliation worker. Do not reopen a fee cap after refunds.

## Production gate

Production remains blocked until the isolated migration harness, all focused behavioral tests, and the controlled Stripe test-mode checklist pass for a dedicated tenant. A separate explicit approval is required before any live credentials, production migration, activation flag, or Twilio resource action.
