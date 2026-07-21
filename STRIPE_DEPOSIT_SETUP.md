# Stripe 25% Deposit Setup

The booking form now creates a pending reservation, opens Stripe Checkout for a 25% non-refundable deposit, and confirms the reservation through a Stripe webhook.

## 1. Run the Supabase migration

Open Supabase > SQL Editor and run:

`supabase/stripe_deposit_migration.sql`

## 2. Add Vercel environment variables

In Vercel > Project > Settings > Environment Variables, add these for Production, Preview, and Development as appropriate:

- `NEXT_PUBLIC_SITE_URL` — your deployed site URL, with no trailing slash
- `STRIPE_SECRET_KEY` — Stripe secret key (`sk_test_...` while testing)
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret (`whsec_...`)
- Existing Supabase variables must remain configured

A Stripe Price ID is no longer needed because the 25% deposit is calculated from the live Supabase inventory price.

## 3. Create the Stripe webhook

In Stripe Dashboard > Developers > Webhooks, create an endpoint:

`https://YOUR-DOMAIN/api/stripe/webhook`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET` in Vercel.

## 4. Deploy and test

Push these files to GitHub, allow Vercel to deploy, then make a test reservation.

With Stripe test keys, use test card:

- Card: `4242 4242 4242 4242`
- Any future expiration date
- Any 3-digit CVC
- Any ZIP code

Expected result:

1. Booking starts as `pending_payment`.
2. Stripe collects 25% of the live inventory price.
3. Successful payment redirects to `/success`.
4. Webhook changes the booking and booking item to `confirmed`.
5. The remaining 75% appears on the confirmation page and is stored as `balance_due_cents`.

Checkout sessions expire after 30 minutes. An expired session changes the pending booking and booking item to `expired`, making the date available again.
