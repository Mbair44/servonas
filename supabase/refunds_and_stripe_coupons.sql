-- NRS Party Rentals: refund and Stripe coupon tracking.
-- Run once in Supabase SQL Editor before deploying the refund UI.

begin;

alter table public.bookings
  add column if not exists refunded_cents integer not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists stripe_refund_id text,
  add column if not exists refund_reason text,
  add column if not exists stripe_promotion_code_id text,
  add column if not exists stripe_coupon_id text,
  add column if not exists discount_cents integer not null default 0,
  add column if not exists amount_paid_cents integer not null default 0;

commit;
