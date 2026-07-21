-- Servonas Epic 4.5: customer-facing booking portal and website embed.
create extension if not exists "pgcrypto";

create table if not exists public.booking_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  enabled boolean not null default false,
  public_slug text not null,
  logo_url text,
  brand_color text not null default '#4f46e5',
  welcome_message text not null default 'Choose a service and a time that works for you.',
  confirmation_message text not null default 'Thanks! Your appointment request has been received.',
  timezone text not null default 'America/Phoenix',
  minimum_notice_hours integer not null default 2 check (minimum_notice_hours between 0 and 720),
  maximum_days_ahead integer not null default 60 check (maximum_days_ahead between 1 and 365),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  auto_confirm boolean not null default false,
  collect_address boolean not null default true,
  daily_appointment_limit integer check (daily_appointment_limit is null or daily_appointment_limit between 1 and 100),
  intake_questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint booking_settings_public_slug_format check (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
alter table public.booking_settings add column if not exists daily_appointment_limit integer check (daily_appointment_limit is null or daily_appointment_limit between 1 and 100);
alter table public.booking_settings add column if not exists intake_questions jsonb not null default '[]'::jsonb;
create unique index if not exists booking_settings_public_slug_unique on public.booking_settings(lower(public_slug));

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 1440),
  price_amount numeric(12,2) check (price_amount is null or price_amount >= 0),
  price_label text not null default 'fixed' check (price_label in ('fixed','starting_at','quote')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  is_deleted boolean not null default false
);
create index if not exists services_business_active_idx on public.services(business_id,active,sort_order) where is_deleted=false;

create table if not exists public.booking_availability (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_availability_time_order check (end_time > start_time),
  unique (business_id,weekday,start_time,end_time)
);
create index if not exists booking_availability_business_day_idx on public.booking_availability(business_id,weekday) where active=true;

create table if not exists public.booking_blackouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint booking_blackouts_time_order check (ends_at > starts_at)
);
create index if not exists booking_blackouts_business_time_idx on public.booking_blackouts(business_id,starts_at,ends_at);

create table if not exists public.public_booking_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  source text not null default 'website',
  request_key text,
  submitted_at timestamptz not null default now(),
  user_agent text,
  status text not null default 'accepted' check (status in ('accepted','rejected','spam'))
);
create unique index if not exists public_booking_request_key_unique on public.public_booking_submissions(business_id,request_key) where request_key is not null;

alter table public.jobs add column if not exists service_id uuid references public.services(id) on delete set null;
alter table public.jobs add column if not exists booking_source text not null default 'dashboard';
alter table public.jobs add column if not exists public_booking_id uuid references public.public_booking_submissions(id) on delete set null;
create index if not exists jobs_service_idx on public.jobs(service_id);

alter table public.booking_settings enable row level security;
alter table public.services enable row level security;
alter table public.booking_availability enable row level security;
alter table public.booking_blackouts enable row level security;
alter table public.public_booking_submissions enable row level security;

drop policy if exists "members can view booking settings" on public.booking_settings;
create policy "members can view booking settings" on public.booking_settings for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "admins manage booking settings" on public.booking_settings;
create policy "admins manage booking settings" on public.booking_settings for all to authenticated using (public.has_business_role(business_id,array['owner','admin'])) with check (public.has_business_role(business_id,array['owner','admin']));

drop policy if exists "members can view services" on public.services;
create policy "members can view services" on public.services for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "managers manage services" on public.services;
create policy "managers manage services" on public.services for all to authenticated using (public.has_business_role(business_id,array['owner','admin','manager'])) with check (public.has_business_role(business_id,array['owner','admin','manager']));

drop policy if exists "members can view availability" on public.booking_availability;
create policy "members can view availability" on public.booking_availability for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "managers manage availability" on public.booking_availability;
create policy "managers manage availability" on public.booking_availability for all to authenticated using (public.has_business_role(business_id,array['owner','admin','manager'])) with check (public.has_business_role(business_id,array['owner','admin','manager']));

drop policy if exists "members can view blackouts" on public.booking_blackouts;
create policy "members can view blackouts" on public.booking_blackouts for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "managers manage blackouts" on public.booking_blackouts;
create policy "managers manage blackouts" on public.booking_blackouts for all to authenticated using (public.has_business_role(business_id,array['owner','admin','manager'])) with check (public.has_business_role(business_id,array['owner','admin','manager']));

drop policy if exists "members can view public submissions" on public.public_booking_submissions;
create policy "members can view public submissions" on public.public_booking_submissions for select to authenticated using (public.is_business_member(business_id));

-- Seed sensible weekday hours and a settings row for every existing business.
insert into public.booking_settings(business_id,public_slug)
select id,slug from public.businesses
on conflict (business_id) do nothing;
insert into public.booking_availability(business_id,weekday,start_time,end_time)
select b.id,d,'09:00','17:00' from public.businesses b cross join generate_series(1,5) d
on conflict do nothing;
