alter table public.bookings add column if not exists final_payment_authorization_version text;
alter table public.bookings add column if not exists final_payment_authorization_source text;
