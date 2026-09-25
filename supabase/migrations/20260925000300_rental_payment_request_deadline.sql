alter table public.bookings add column if not exists payment_request_expires_at timestamptz;
create index if not exists bookings_pending_payment_request_expiry_idx on public.bookings(payment_request_expires_at) where status='pending_payment' and payment_request_expires_at is not null;
