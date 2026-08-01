begin;

create table public.customer_hvac_equipment (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  service_location_id uuid references public.service_locations(id) on delete set null,
  equipment_type text not null,
  name text not null,
  manufacturer text,
  model text,
  serial_number text,
  model_year smallint,
  capacity_tons numeric(4,2),
  fuel_type text,
  refrigerant_type text,
  filter_size text,
  installed_on date,
  warranty_expires_on date,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_hvac_equipment_business_fk foreign key(business_id)
    references public.businesses(id) on delete cascade,
  constraint customer_hvac_equipment_customer_fk foreign key(business_id,customer_id)
    references public.customers(business_id,id) on delete cascade,
  constraint customer_hvac_equipment_type_check check(equipment_type in (
    'central_air','heat_pump','furnace','mini_split','air_handler','package_unit',
    'boiler','thermostat','evaporative_cooler','other'
  )),
  constraint customer_hvac_equipment_name_check check(length(btrim(name)) between 1 and 150),
  constraint customer_hvac_equipment_year_check check(model_year is null or model_year between 1900 and 2200),
  constraint customer_hvac_equipment_capacity_check check(capacity_tons is null or capacity_tons>0),
  constraint customer_hvac_equipment_notes_check check(notes is null or length(notes)<=3000)
);

create index customer_hvac_equipment_customer_idx
  on public.customer_hvac_equipment(business_id,customer_id,is_active,created_at desc);
create index customer_hvac_equipment_location_idx
  on public.customer_hvac_equipment(business_id,service_location_id)
  where service_location_id is not null;

alter table public.customer_hvac_equipment enable row level security;

create policy "members view customer hvac equipment" on public.customer_hvac_equipment
  for select to authenticated using(public.is_business_member(business_id));
create policy "managers create customer hvac equipment" on public.customer_hvac_equipment
  for insert to authenticated with check(
    public.has_business_role(business_id,array['owner','admin','manager'])
    and created_by=auth.uid()
  );
create policy "managers update customer hvac equipment" on public.customer_hvac_equipment
  for update to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']))
  with check(public.has_business_role(business_id,array['owner','admin','manager']));

create trigger customer_hvac_equipment_updated_at before update on public.customer_hvac_equipment
for each row execute function public.set_routing_updated_at();

comment on table public.customer_hvac_equipment is
  'HVAC systems installed at customer properties; separate from company fleet and workforce assets.';

commit;
