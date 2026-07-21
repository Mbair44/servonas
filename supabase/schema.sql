create extension if not exists pgcrypto;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rental_date date not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  address text not null,
  city text not null check (city in ('Gilbert', 'Chandler', 'Mesa')),
  zip_code text not null,
  event_start_time time not null,
  event_end_time time not null,
  notes text,
  amount_cents integer not null default 35000,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'confirmed', 'cancelled', 'expired', 'refunded')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  agreement_accepted_at timestamptz,
  paid_at timestamptz
);

create unique index if not exists one_active_booking_per_date
on public.bookings (rental_date)
where status in ('pending_payment', 'paid', 'confirmed');

alter table public.bookings enable row level security;

-- Service-role access is used by the server.
-- Add authenticated admin policies later when Supabase Auth is connected.
