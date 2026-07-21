-- Run once in Supabase SQL Editor before enabling Stripe checkout.
-- Adds payment-tracking fields used by the 25% deposit flow.

begin;

alter table public.bookings
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists deposit_cents integer not null default 0,
  add column if not exists balance_due_cents integer not null default 0,
  add column if not exists paid_at timestamptz;

create unique index if not exists bookings_stripe_checkout_session_unique
  on public.bookings (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

commit;
