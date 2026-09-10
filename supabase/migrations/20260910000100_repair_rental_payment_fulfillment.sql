begin;

-- Repair production environments where the completion-autopay migration was not
-- visible to PostgREST when a paid rental webhook attempted fulfillment.
alter table public.bookings
 add column if not exists final_payment_authorized_at timestamptz,
 add column if not exists stripe_customer_id text,
 add column if not exists stripe_payment_method_id text;

create unique index if not exists bookings_stripe_checkout_session_unique
 on public.bookings(stripe_checkout_session_id)
 where stripe_checkout_session_id is not null;

create unique index if not exists jobs_business_request_key_unique
 on public.jobs(business_id,request_key)
 where request_key is not null;

notify pgrst,'reload schema';

commit;
