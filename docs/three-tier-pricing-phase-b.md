# Three-tier pricing: Phase A/B record

## Status and tenant safety

Phase B is schema and enforcement groundwork only. It does not create Stripe subscriptions, set `application_fee_amount`, charge a platform fee, provision a Twilio number, or alter a tenant's existing plan. Every existing tenant is backfilled as `legacy`, with `rollout_enabled = false`; missing pricing schema also resolves to legacy access. Copper State Bounce therefore retains its present billing and communications behavior.

## Stripe Connect validation before Phase C

The product currently creates **direct charges** on the tenant's connected Stripe account. Stripe supports a Connect application fee for this model by passing `payment_intent_data.application_fee_amount` when creating Checkout, and `application_fee_amount` when directly creating a PaymentIntent, while authenticating the request as the connected account. The connected account must have the appropriate Connect capabilities and the platform must be configured to collect application fees.

This supports all discovered online payment paths, provided Phase C puts the shared reservation result on every one:

| Flow | Existing charge mechanism | Phase C support |
|---|---|---|
| Public rental deposit | Connected-account Checkout | `payment_intent_data.application_fee_amount` |
| Invoice, deposit, and partial invoice payments | Connected-account Checkout | same |
| Managed booking deposit / balance | Connected-account Checkout | same |
| Deposit payment requests | Connected-account Checkout | same |
| Booking amendments / Smart Upsells | Connected-account Checkout | same |
| Scheduled off-session remaining balance | Connected-account PaymentIntent | `application_fee_amount` |

The fee basis is the payment's already-calculated eligible amount: customer charge including sales tax, minus tips, refundable security deposits, and overpayments. Each path must persist this allocation before reserving. This is feasible for existing deposits, partial payments, balances, and amendments only after Phase C adds explicit line/allocation snapshots to the affected payment records. Until then, no flow may enable collection.

`reserve_platform_fee` serializes against one tenant/cycle row, uses integer half-up rounding, and writes an append-only reservation event. Phase C must: reserve before Stripe creation; store its reservation reference in payment metadata and local payment data; capture it once on a verified successful webhook; release it on failed/expired Checkout and a scheduled expiry sweep; and append proportional negative reversal entries on refunds. Refunds never decrease `captured_cents`, so cap capacity is not restored. Disputes create reconciliation events and do not mutate captured fees until their final Stripe event.

## Phase B objects

- `business_pricing_profiles`: explicit `legacy`, `starter`, `growth`, or `scale`, billing anniversary, and rollout control.
- `servonas_subscription_plan_prices`: test/live Stripe price mapping for Growth and Scale only; Starter has no subscription.
- `platform_fee_cycles`, `platform_fee_reservations`, and append-only `platform_fee_ledger`.
- `manual_booking_usage_ledger`: request-key-idempotent staff-booking reservations and consumption. Starter has ten per billing anniversary; public bookings do not call it. Failed creations release the reservation. A future emergency-grace action must be platform-admin audited; no unaudited staff bypass exists.
- Central catalog entitlements for Starter, Growth, and Scale. Scale entries express only server-gated capability availability; no unfinished multi-location feature is enabled or advertised.
- Twilio sender gating now denies explicit Starter profiles while preserving legacy access and existing numbers/history.

## Remaining Phase B limitations

The migration has not been run against any database. Subscription UI/upgrade actions, dashboards, price-page changes, fee collection, refunds/disputes webhook handling, phone-number provisioning checks, inbound/voice route gates, and usage dashboards belong to later phases. In particular, Phase C must add centralized entitlement checks to every Twilio provisioning, inbound, voice, cron, and webhook-triggered sender before a Starter tenant can be migrated.
