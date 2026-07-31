-- Fleet-first extensions for operational workforce assets.
begin;

alter table public.workforce_assets
 add column if not exists odometer_miles integer,
 add column if not exists registration_expires_on date,
 add column if not exists insurance_expires_on date,
 add column if not exists last_service_on date,
 add column if not exists next_service_on date,
 add column if not exists next_service_odometer_miles integer,
 add column if not exists purchase_date date,
 add column if not exists purchase_price numeric(12,2),
 add column if not exists gps_device_id text;

alter table public.workforce_assets drop constraint if exists workforce_assets_fleet_values_check;
alter table public.workforce_assets add constraint workforce_assets_fleet_values_check check(
 (odometer_miles is null or odometer_miles>=0)
 and (next_service_odometer_miles is null or next_service_odometer_miles>=0)
 and (purchase_price is null or purchase_price>=0)
 and (next_service_on is null or last_service_on is null or next_service_on>=last_service_on)
);
create unique index if not exists workforce_assets_plate_unique on public.workforce_assets(business_id,lower(license_plate)) where license_plate is not null;
create unique index if not exists workforce_assets_vin_unique on public.workforce_assets(business_id,lower(vin)) where vin is not null;
create unique index if not exists workforce_assets_gps_device_unique on public.workforce_assets(business_id,lower(gps_device_id)) where gps_device_id is not null;

create table if not exists public.workforce_asset_maintenance_events(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,asset_id uuid not null,
 event_type text not null check(event_type in('inspection','preventive_service','repair','tire_service','registration','insurance','other')),
 status text not null default 'completed' check(status in('scheduled','in_progress','completed','canceled')),
 title text not null,description text,service_provider text,scheduled_for date,completed_on date,
 odometer_miles integer,cost numeric(12,2),created_at timestamptz not null default now(),created_by uuid references auth.users(id),
 foreign key(business_id,asset_id) references public.workforce_assets(business_id,id) on delete cascade,
 check(length(btrim(title)) between 1 and 160),check(description is null or length(description)<=4000),
 check(odometer_miles is null or odometer_miles>=0),check(cost is null or cost>=0)
);
create index if not exists workforce_asset_maintenance_due_idx on public.workforce_asset_maintenance_events(business_id,status,scheduled_for);
create index if not exists workforce_asset_maintenance_history_idx on public.workforce_asset_maintenance_events(business_id,asset_id,coalesce(completed_on,scheduled_for) desc);

alter table public.workforce_asset_maintenance_events enable row level security;
create policy "office reads fleet maintenance" on public.workforce_asset_maintenance_events for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer fleet maintenance" on public.workforce_asset_maintenance_events for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));

notify pgrst, 'reload schema';
commit;
