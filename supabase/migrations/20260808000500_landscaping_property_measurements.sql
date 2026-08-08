begin;
create table if not exists public.landscaping_property_measurements(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid not null,service_location_id uuid not null,name text not null check(char_length(btrim(name)) between 1 and 160),
 shapes jsonb not null default '[]'::jsonb check(jsonb_typeof(shapes)='array'),total_area_sqft numeric(14,1) not null default 0 check(total_area_sqft>=0),total_length_ft numeric(14,1) not null default 0 check(total_length_ft>=0),
 imagery_provider text not null default 'google_maps',measurement_method text not null default 'user_traced_satellite',measured_at timestamptz not null default now(),created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,id),foreign key(business_id,customer_id) references public.customers(business_id,id),foreign key(business_id,service_location_id) references public.service_locations(business_id,id)
);
create index if not exists landscaping_measurements_business_idx on public.landscaping_property_measurements(business_id,created_at desc);
alter table public.landscaping_property_measurements enable row level security;
create policy "members read landscaping measurements" on public.landscaping_property_measurements for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage landscaping measurements" on public.landscaping_property_measurements for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
commit;
