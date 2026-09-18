create table if not exists public.inventory_item_specifications (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
 label text not null check (char_length(trim(label)) between 1 and 80), value text not null check (char_length(trim(value)) between 1 and 500), icon text, sort_order integer not null default 0, is_public boolean not null default true,
 created_at timestamptz not null default now(), unique(inventory_item_id,label)
);
create table if not exists public.inventory_item_booking_options (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
 name text not null check (char_length(trim(name)) between 1 and 100), required boolean not null default false, sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists public.inventory_item_booking_option_choices (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 option_id uuid not null references public.inventory_item_booking_options(id) on delete cascade,
 label text not null check (char_length(trim(label)) between 1 and 100), price_adjustment_cents integer not null default 0 check (price_adjustment_cents between -100000000 and 100000000), sort_order integer not null default 0,
 unique(option_id,label)
);
alter table public.booking_items add column if not exists option_selections jsonb not null default '[]'::jsonb;
alter table public.booking_items add column if not exists option_adjustment_cents integer not null default 0;
create index if not exists inventory_item_specifications_item_idx on public.inventory_item_specifications(inventory_item_id,sort_order);
create index if not exists inventory_item_booking_options_item_idx on public.inventory_item_booking_options(inventory_item_id,sort_order);
create index if not exists inventory_item_booking_option_choices_option_idx on public.inventory_item_booking_option_choices(option_id,sort_order);
alter table public.inventory_item_specifications enable row level security;
alter table public.inventory_item_booking_options enable row level security;
alter table public.inventory_item_booking_option_choices enable row level security;
create policy "members manage item specifications" on public.inventory_item_specifications for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members manage item booking options" on public.inventory_item_booking_options for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members manage item booking option choices" on public.inventory_item_booking_option_choices for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
