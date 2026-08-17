-- First-party tenant marketing attribution for public websites and booking.
create table if not exists public.booking_attribution_sessions (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  first_landing_url text,
  first_landing_path text,
  first_referrer text,
  gclid text,
  gbraid text,
  wbraid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id)
);

create table if not exists public.booking_funnel_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  attribution_session_id uuid,
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  event_name text not null check (event_name in ('landing_page_view','inventory_item_view','check_availability_clicked','availability_date_selected','booking_started','customer_info_entered','checkout_started','booking_completed')),
  event_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  booking_total_cents bigint,
  amount_paid_cents bigint,
  currency text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (business_id, attribution_session_id) references public.booking_attribution_sessions(business_id,id) on delete restrict
);

create table if not exists public.booking_attribution_snapshots (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  attribution_session_id uuid,
  gclid text,
  gbraid text,
  wbraid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, attribution_session_id) references public.booking_attribution_sessions(business_id,id) on delete restrict
);

create index if not exists booking_attribution_sessions_business_seen_idx on public.booking_attribution_sessions(business_id,last_seen_at desc);
create index if not exists booking_funnel_events_business_event_idx on public.booking_funnel_events(business_id,event_name,occurred_at desc);
create index if not exists booking_funnel_events_session_idx on public.booking_funnel_events(attribution_session_id,occurred_at desc);
create index if not exists booking_funnel_events_booking_idx on public.booking_funnel_events(booking_id,event_name);
create index if not exists booking_attribution_snapshots_business_campaign_idx on public.booking_attribution_snapshots(business_id,utm_source,utm_campaign);

alter table public.booking_attribution_sessions enable row level security;
alter table public.booking_funnel_events enable row level security;
alter table public.booking_attribution_snapshots enable row level security;
drop policy if exists "members view booking attribution sessions" on public.booking_attribution_sessions;
create policy "members view booking attribution sessions" on public.booking_attribution_sessions for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "members view booking funnel events" on public.booking_funnel_events;
create policy "members view booking funnel events" on public.booking_funnel_events for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "members view booking attribution snapshots" on public.booking_attribution_snapshots;
create policy "members view booking attribution snapshots" on public.booking_attribution_snapshots for select to authenticated using (public.is_business_member(business_id));
