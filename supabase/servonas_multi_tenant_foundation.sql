-- Servonas Phase 1 multi-tenant foundation
create extension if not exists "pgcrypto";

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid references auth.users(id) on delete set null,
  business_model text not null default 'services' check (business_model in ('rentals','services','appointments','hybrid')),
  email text,
  phone text,
  logo_url text,
  primary_color text default '#2563eb',
  enabled_modules jsonb not null default '["booking","payments","customers"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','manager','staff')),
  created_at timestamptz not null default now(),
  primary key (business_id,user_id)
);

-- Add tenant ownership to the current NRS tables when they exist.
do $$ begin
  if exists(select 1 from information_schema.tables where table_schema='public' and table_name='inventory') then
    alter table public.inventory add column if not exists business_id uuid references public.businesses(id) on delete cascade;
    create index if not exists inventory_business_id_idx on public.inventory(business_id);
  end if;
  if exists(select 1 from information_schema.tables where table_schema='public' and table_name='bookings') then
    alter table public.bookings add column if not exists business_id uuid references public.businesses(id) on delete cascade;
    create index if not exists bookings_business_id_idx on public.bookings(business_id);
  end if;
  if exists(select 1 from information_schema.tables where table_schema='public' and table_name='blocked_dates') then
    alter table public.blocked_dates add column if not exists business_id uuid references public.businesses(id) on delete cascade;
    create index if not exists blocked_dates_business_id_idx on public.blocked_dates(business_id);
  end if;
end $$;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

create policy "members can view businesses" on public.businesses for select using (
  owner_user_id = auth.uid() or exists(select 1 from public.business_members m where m.business_id=id and m.user_id=auth.uid())
);
create policy "owners can update businesses" on public.businesses for update using (owner_user_id=auth.uid());
create policy "members can view membership" on public.business_members for select using (user_id=auth.uid());
