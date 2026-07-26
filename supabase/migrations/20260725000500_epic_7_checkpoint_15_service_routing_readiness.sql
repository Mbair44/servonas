begin;

create table public.business_routing_policies (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  default_service_duration_minutes integer not null default 60 check(default_service_duration_minutes between 1 and 1440),
  imminent_job_lock_minutes integer not null default 60 check(imminent_job_lock_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.recurring_service_series (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  service_location_id uuid not null,
  service_id uuid,
  cadence_unit text not null,
  cadence_interval integer not null default 1,
  next_due_on date,
  preferred_window jsonb not null default '{}'::jsonb,
  routing_requirements jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade,
  foreign key(business_id,service_location_id) references public.service_locations(business_id,id) on delete cascade,
  foreign key(business_id,service_id) references public.services(business_id,id),
  constraint recurring_service_cadence_check check(cadence_unit in ('day','week','month','year')),
  constraint recurring_service_interval_check check(cadence_interval between 1 and 120),
  constraint recurring_service_preferred_window_check check(jsonb_typeof(preferred_window)='object'),
  constraint recurring_service_requirements_check check(jsonb_typeof(routing_requirements)='object')
);
create unique index recurring_service_series_business_id_id_unique on public.recurring_service_series(business_id,id);
create index recurring_service_series_due_idx on public.recurring_service_series(business_id,next_due_on) where is_active;

alter table public.jobs
  add column recurring_service_series_id uuid,
  add column routing_requirements jsonb not null default '{}'::jsonb;
alter table public.jobs add constraint jobs_recurring_service_series_tenant_fk
  foreign key(business_id,recurring_service_series_id)
  references public.recurring_service_series(business_id,id) on delete set null;
alter table public.jobs add constraint jobs_routing_requirements_object_check
  check(jsonb_typeof(routing_requirements)='object');

alter table public.technician_profiles
  add column routing_capabilities jsonb not null default '{}'::jsonb;
alter table public.technician_profiles add constraint technician_routing_capabilities_object_check
  check(jsonb_typeof(routing_capabilities)='object');

alter table public.route_stops
  add column service_duration_source text not null default 'documented_fallback';
alter table public.route_stops add constraint route_stops_duration_source_check
  check(service_duration_source in ('job','service','price_book','business_default','documented_fallback'));

alter table public.business_routing_policies enable row level security;
alter table public.recurring_service_series enable row level security;
create policy "routing members read policy" on public.business_routing_policies for select to authenticated
  using(public.is_business_member(business_id));
create policy "routing managers manage policy" on public.business_routing_policies for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']))
  with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members read recurring service series" on public.recurring_service_series for select to authenticated
  using(public.is_business_member(business_id));
create policy "managers manage recurring service series" on public.recurring_service_series for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']))
  with check(public.has_business_role(business_id,array['owner','admin','manager']));

create trigger business_routing_policies_updated_at before update on public.business_routing_policies
for each row execute function public.set_routing_updated_at();
create trigger recurring_service_series_updated_at before update on public.recurring_service_series
for each row execute function public.set_routing_updated_at();

comment on table public.recurring_service_series is
  'Generic recurrence readiness only. This checkpoint does not generate jobs automatically.';
comment on column public.jobs.routing_requirements is
  'Provider-neutral future constraints such as skills, licenses, service area, equipment, access, or treatment restrictions. Enforce only populated, supported keys.';
comment on column public.technician_profiles.routing_capabilities is
  'Provider-neutral capability facts used only when matching job routing requirements are populated.';
comment on column public.route_stops.service_duration_source is
  'Audit source for the nonzero expected service duration used by route planning.';

commit;
