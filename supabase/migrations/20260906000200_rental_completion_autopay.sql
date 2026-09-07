alter table public.bookings
 add column if not exists final_payment_authorized_at timestamptz,
 add column if not exists stripe_customer_id text,
 add column if not exists stripe_payment_method_id text;

comment on column public.bookings.final_payment_authorized_at is
 'Records the customer authorization captured at rental checkout to charge this booking remaining balance after job completion.';
comment on column public.bookings.stripe_customer_id is
 'Connected-account Stripe customer saved for this booking final payment only.';
comment on column public.bookings.stripe_payment_method_id is
 'Connected-account Stripe payment method saved for this booking final payment only.';

notify pgrst,'reload schema';
