-- Epic 7, Checkpoint 2: provider-neutral route planning domain.
-- Jobs and active primary job_assignments remain authoritative. Every record in
-- this migration is derived planning/calculation data and existing scheduling
-- continues to operate when no route plan exists.
begin;

do $$
begin
  if to_regclass('public.businesses') is null
    or to_regclass('public.jobs') is null
    or to_regclass('public.service_locations') is null
    or to_regclass('public.technician_profiles') is null
    or to_regclass('public.job_assignments') is null then
    raise exception 'Epic 7 Checkpoint 2 requires the Epic 5 field-service foundation';
  end if;
  if to_regprocedure('public.has_business_role(uuid,text[])') is null
    or to_regprocedure('public.is_assigned_technician(uuid,uuid)') is null then
    raise exception 'Epic 7 Checkpoint 2 requires the current tenant authorization helpers';
  end if;
end $$;

create table public.route_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_date date not null,
  business_timezone text not null,
  status text not null default 'draft',
  calculation_status text not null default 'not_calculated',
  provider text,
  version bigint not null default 1,
  calculation_revision bigint not null default 0,
  travel_mode text not null default 'driving',
  vehicle_profile text,
  route_options jsonb not null default '{}'::jsonb,
  calculation_signature text,
  total_driving_distance_meters integer,
  total_driving_duration_seconds integer,
  optimized_at timestamptz,
  calculated_at timestamptz,
  stale_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint route_plans_status_check
    check (status in ('draft','active','archived')),
  constraint route_plans_calculation_status_check
    check (calculation_status in (
      'not_calculated','queued','calculating','ready','partial','failed','stale'
    )),
  constraint route_plans_version_check check (version > 0),
  constraint route_plans_calculation_revision_check check (calculation_revision >= 0),
  constraint route_plans_travel_mode_check check (length(trim(travel_mode)) > 0),
  constraint route_plans_route_options_object_check check (jsonb_typeof(route_options)='object'),
  constraint route_plans_distance_check
    check (total_driving_distance_meters is null or total_driving_distance_meters >= 0),
  constraint route_plans_duration_check
    check (total_driving_duration_seconds is null or total_driving_duration_seconds >= 0),
  constraint route_plans_provider_state_check
    check (
      calculation_status in ('not_calculated','queued','stale')
      or provider is not null
    )
);
comment on table public.route_plans is
  'Derived daily route-planning state. Scheduled jobs and job assignments remain authoritative.';
comment on column public.route_plans.total_driving_distance_meters is
  'Sum of successfully calculated road-network legs only; never a straight-line substitute.';
comment on column public.route_plans.total_driving_duration_seconds is
  'Sum of provider-calculated driving durations only.';
comment on column public.route_plans.travel_mode is
  'Provider-neutral travel mode. Text is intentionally extensible for future provider modes without a schema migration.';
comment on column public.route_plans.calculation_revision is
  'Incremented whenever a new route calculation is queued or started.';

create unique index route_plans_business_id_id_unique
  on public.route_plans(business_id,id);
create unique index route_plans_business_service_date_unique
  on public.route_plans(business_id,service_date);
create index route_plans_business_date_status_idx
  on public.route_plans(business_id,service_date,status,calculation_status);

create table public.technician_routes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  route_plan_id uuid not null,
  technician_id uuid not null,
  status text not null default 'draft',
  origin_type text not null default 'none',
  origin_label text,
  origin_address_snapshot text,
  origin_latitude numeric(10,7),
  origin_longitude numeric(10,7),
  origin_is_private boolean not null default false,
  destination_type text not null default 'none',
  destination_label text,
  destination_address_snapshot text,
  destination_latitude numeric(10,7),
  destination_longitude numeric(10,7),
  destination_is_private boolean not null default false,
  driving_distance_meters integer,
  driving_duration_seconds integer,
  service_duration_seconds integer not null default 0,
  stop_count integer not null default 0,
  encoded_polyline text,
  provider text,
  provider_route_id text,
  calculation_status text not null default 'not_calculated',
  calculated_at timestamptz,
  calculation_signature text,
  stale_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint technician_routes_plan_tenant_fk
    foreign key (business_id,route_plan_id)
    references public.route_plans(business_id,id) on delete cascade,
  constraint technician_routes_technician_tenant_fk
    foreign key (business_id,technician_id)
    references public.technician_profiles(business_id,id) on delete cascade,
  constraint technician_routes_status_check
    check (status in ('draft','active','completed','archived')),
  constraint technician_routes_origin_type_check
    check (origin_type in ('office','technician','custom','first_stop','none')),
  constraint technician_routes_destination_type_check
    check (destination_type in ('office','technician','custom','last_stop','none')),
  constraint technician_routes_calculation_status_check
    check (calculation_status in (
      'not_calculated','queued','calculating','ready','partial','failed','stale'
    )),
  constraint technician_routes_origin_latitude_check
    check (origin_latitude is null or origin_latitude between -90 and 90),
  constraint technician_routes_origin_longitude_check
    check (origin_longitude is null or origin_longitude between -180 and 180),
  constraint technician_routes_destination_latitude_check
    check (destination_latitude is null or destination_latitude between -90 and 90),
  constraint technician_routes_destination_longitude_check
    check (destination_longitude is null or destination_longitude between -180 and 180),
  constraint technician_routes_origin_coordinates_check
    check ((origin_latitude is null)=(origin_longitude is null)),
  constraint technician_routes_destination_coordinates_check
    check ((destination_latitude is null)=(destination_longitude is null)),
  constraint technician_routes_private_origin_check check (
    not origin_is_private
    or (
      origin_address_snapshot is null
      and origin_latitude is null
      and origin_longitude is null
    )
  ),
  constraint technician_routes_private_destination_check check (
    not destination_is_private
    or (
      destination_address_snapshot is null
      and destination_latitude is null
      and destination_longitude is null
    )
  ),
  constraint technician_routes_distance_check
    check (driving_distance_meters is null or driving_distance_meters >= 0),
  constraint technician_routes_duration_check
    check (driving_duration_seconds is null or driving_duration_seconds >= 0),
  constraint technician_routes_service_duration_check check (service_duration_seconds >= 0),
  constraint technician_routes_stop_count_check check (stop_count >= 0)
);
comment on column public.technician_routes.encoded_polyline is
  'Compact provider road-network geometry. Full provider responses and redundant JSON geometry are not persisted.';
comment on column public.technician_routes.driving_distance_meters is
  'Road-network distance only. Null when driving routing is unavailable.';
comment on column public.technician_routes.origin_is_private is
  'When true, the general route row is prohibited from storing the technician private address or coordinates.';
comment on column public.technician_routes.destination_is_private is
  'When true, the general route row is prohibited from storing the technician private address or coordinates.';

create unique index technician_routes_business_id_id_unique
  on public.technician_routes(business_id,id);
create unique index technician_routes_business_plan_id_unique
  on public.technician_routes(business_id,route_plan_id,id);
create unique index technician_routes_plan_technician_unique
  on public.technician_routes(business_id,route_plan_id,technician_id);
create index technician_routes_business_technician_status_idx
  on public.technician_routes(business_id,technician_id,status,calculation_status);
create index technician_routes_plan_status_idx
  on public.technician_routes(route_plan_id,calculation_status);

create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  route_plan_id uuid not null,
  technician_route_id uuid not null,
  job_id uuid not null,
  service_location_id uuid,
  sequence integer not null,
  status text not null default 'planned',
  planned_arrival_at timestamptz,
  planned_departure_at timestamptz,
  appointment_window_start timestamptz,
  appointment_window_end timestamptz,
  service_duration_seconds integer not null default 0,
  latitude numeric(10,7),
  longitude numeric(10,7),
  address_snapshot text not null,
  is_locked boolean not null default false,
  manual_override boolean not null default false,
  calculation_status text not null default 'not_calculated',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint route_stops_route_tenant_fk
    foreign key (business_id,route_plan_id,technician_route_id)
    references public.technician_routes(business_id,route_plan_id,id) on delete cascade,
  constraint route_stops_job_tenant_fk
    foreign key (business_id,job_id)
    references public.jobs(business_id,id) on delete cascade,
  constraint route_stops_location_tenant_fk
    foreign key (business_id,service_location_id)
    references public.service_locations(business_id,id),
  constraint route_stops_sequence_check check (sequence > 0),
  constraint route_stops_status_check
    check (status in ('planned','en_route','arrived','completed','skipped','cancelled')),
  constraint route_stops_calculation_status_check
    check (calculation_status in (
      'not_calculated','queued','calculating','ready','failed','stale','excluded'
    )),
  constraint route_stops_service_duration_check check (service_duration_seconds >= 0),
  constraint route_stops_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint route_stops_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint route_stops_coordinates_check check ((latitude is null)=(longitude is null)),
  constraint route_stops_planned_order_check
    check (
      planned_departure_at is null or planned_arrival_at is null
      or planned_departure_at >= planned_arrival_at
    ),
  constraint route_stops_window_order_check
    check (
      appointment_window_end is null or appointment_window_start is null
      or appointment_window_end >= appointment_window_start
    )
);
comment on column public.route_stops.address_snapshot is
  'Immutable routing address captured when the route version was built.';

create unique index route_stops_business_id_id_unique
  on public.route_stops(business_id,id);
create unique index route_stops_business_route_id_unique
  on public.route_stops(business_id,technician_route_id,id);
create unique index route_stops_route_sequence_unique
  on public.route_stops(business_id,technician_route_id,sequence);
create unique index route_stops_plan_job_unique
  on public.route_stops(business_id,route_plan_id,job_id);
create index route_stops_business_job_idx on public.route_stops(business_id,job_id);
create index route_stops_business_location_idx
  on public.route_stops(business_id,service_location_id)
  where service_location_id is not null;
create index route_stops_route_status_idx
  on public.route_stops(technician_route_id,status,calculation_status);

create table public.route_legs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  technician_route_id uuid not null,
  from_route_stop_id uuid,
  to_route_stop_id uuid,
  from_origin_type text,
  to_destination_type text,
  sequence integer not null,
  driving_distance_meters integer,
  driving_duration_seconds integer,
  straight_line_distance_meters integer,
  encoded_polyline text,
  provider text,
  provider_request_id text,
  calculation_status text not null default 'not_calculated',
  calculated_at timestamptz,
  provider_warnings jsonb not null default '[]'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_legs_route_tenant_fk
    foreign key (business_id,technician_route_id)
    references public.technician_routes(business_id,id) on delete cascade,
  constraint route_legs_from_stop_tenant_fk
    foreign key (business_id,technician_route_id,from_route_stop_id)
    references public.route_stops(business_id,technician_route_id,id) on delete cascade,
  constraint route_legs_to_stop_tenant_fk
    foreign key (business_id,technician_route_id,to_route_stop_id)
    references public.route_stops(business_id,technician_route_id,id) on delete cascade,
  constraint route_legs_sequence_check check (sequence > 0),
  constraint route_legs_driving_distance_check
    check (driving_distance_meters is null or driving_distance_meters >= 0),
  constraint route_legs_driving_duration_check
    check (driving_duration_seconds is null or driving_duration_seconds >= 0),
  constraint route_legs_straight_line_distance_check
    check (straight_line_distance_meters is null or straight_line_distance_meters >= 0),
  constraint route_legs_calculation_status_check
    check (calculation_status in (
      'not_calculated','queued','calculating','ready','failed','stale','excluded'
    )),
  constraint route_legs_provider_warnings_array_check
    check (jsonb_typeof(provider_warnings)='array'),
  constraint route_legs_from_endpoint_check
    check (
      (from_route_stop_id is not null and from_origin_type is null)
      or
      (from_route_stop_id is null and from_origin_type in ('office','technician','custom','route_origin'))
    ),
  constraint route_legs_to_endpoint_check
    check (
      (to_route_stop_id is not null and to_destination_type is null)
      or
      (to_route_stop_id is null and to_destination_type in ('office','technician','custom','route_destination'))
    ),
  constraint route_legs_driving_metrics_pair_check
    check ((driving_distance_meters is null)=(driving_duration_seconds is null)),
  constraint route_legs_ready_metrics_check
    check (
      calculation_status <> 'ready'
      or (driving_distance_meters is not null and provider is not null and calculated_at is not null)
    )
);
comment on column public.route_legs.driving_distance_meters is
  'Authoritative provider-calculated road distance. Never populated from straight-line distance.';
comment on column public.route_legs.straight_line_distance_meters is
  'Optional internal heuristic. It must never be labeled or totaled as driving distance.';
comment on column public.route_legs.encoded_polyline is
  'Compact road-following leg geometry; full provider response payloads are intentionally not stored.';

create unique index route_legs_business_id_id_unique
  on public.route_legs(business_id,id);
create unique index route_legs_route_sequence_unique
  on public.route_legs(business_id,technician_route_id,sequence);
create index route_legs_route_status_idx
  on public.route_legs(technician_route_id,calculation_status);

create table public.route_optimization_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  route_plan_id uuid not null,
  status text not null default 'pending',
  provider text not null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  requested_by uuid references auth.users(id) on delete set null,
  plan_version bigint not null,
  calculation_signature text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb,
  error_code text,
  provider_request_id text,
  before_driving_distance_meters integer,
  after_driving_distance_meters integer,
  before_driving_duration_seconds integer,
  after_driving_duration_seconds integer,
  created_at timestamptz not null default now(),
  constraint route_optimization_runs_plan_tenant_fk
    foreign key (business_id,route_plan_id)
    references public.route_plans(business_id,id) on delete cascade,
  constraint route_optimization_runs_status_check
    check (status in ('pending','running','completed','failed','cancelled','superseded')),
  constraint route_optimization_runs_plan_version_check check (plan_version > 0),
  constraint route_optimization_runs_input_object_check
    check (jsonb_typeof(input_snapshot)='object'),
  constraint route_optimization_runs_output_object_check
    check (output_snapshot is null or jsonb_typeof(output_snapshot)='object'),
  constraint route_optimization_runs_metrics_check check (
    (before_driving_distance_meters is null or before_driving_distance_meters >= 0)
    and (after_driving_distance_meters is null or after_driving_distance_meters >= 0)
    and (before_driving_duration_seconds is null or before_driving_duration_seconds >= 0)
    and (after_driving_duration_seconds is null or after_driving_duration_seconds >= 0)
  )
);
create unique index route_optimization_runs_business_id_id_unique
  on public.route_optimization_runs(business_id,id);
comment on column public.route_optimization_runs.input_snapshot is
  'Normalized provider-neutral optimization inputs for audit; never credentials or a raw provider request.';
comment on column public.route_optimization_runs.output_snapshot is
  'Normalized provider-neutral optimization summary; full provider response payloads are not stored.';
create unique index route_optimization_runs_business_plan_id_unique
  on public.route_optimization_runs(business_id,route_plan_id,id);
create index route_optimization_runs_plan_status_idx
  on public.route_optimization_runs(route_plan_id,status,requested_at desc);
create index route_optimization_runs_business_status_idx
  on public.route_optimization_runs(business_id,status,requested_at desc);

create table public.route_suggestions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  route_plan_id uuid not null,
  optimization_run_id uuid not null,
  suggestion_type text not null,
  status text not null default 'pending',
  summary text not null,
  estimated_distance_saved_meters integer,
  estimated_time_saved_seconds integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id) on delete set null,
  constraint route_suggestions_plan_tenant_fk
    foreign key (business_id,route_plan_id)
    references public.route_plans(business_id,id) on delete cascade,
  constraint route_suggestions_run_tenant_fk
    foreign key (business_id,route_plan_id,optimization_run_id)
    references public.route_optimization_runs(business_id,route_plan_id,id) on delete cascade,
  constraint route_suggestions_type_check
    check (suggestion_type in ('reorder','reassign','origin','destination','schedule_warning')),
  constraint route_suggestions_status_check
    check (status in ('pending','accepted','dismissed','superseded')),
  constraint route_suggestions_distance_check
    check (estimated_distance_saved_meters is null or estimated_distance_saved_meters >= 0),
  constraint route_suggestions_duration_check
    check (estimated_time_saved_seconds is null or estimated_time_saved_seconds >= 0),
  constraint route_suggestions_payload_object_check check (jsonb_typeof(payload)='object'),
  constraint route_suggestions_decision_check check (
    (status='accepted' and accepted_at is not null and accepted_by is not null and dismissed_at is null)
    or (status='dismissed' and dismissed_at is not null and dismissed_by is not null and accepted_at is null)
    or (status in ('pending','superseded') and accepted_at is null and dismissed_at is null)
  )
);
create unique index route_suggestions_business_id_id_unique
  on public.route_suggestions(business_id,id);
create index route_suggestions_plan_status_idx
  on public.route_suggestions(route_plan_id,status,created_at desc);
create index route_suggestions_run_idx on public.route_suggestions(optimization_run_id);

-- Shared timestamp behavior for mutable routing records.
create or replace function public.set_routing_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at=now();
  return new;
end; $$;

-- Starting a new calculation always advances both the calculation revision and
-- route version. This protects optimistic clients even when callers update the
-- row directly instead of using a future calculation orchestration RPC.
create or replace function public.enforce_route_plan_calculation_revision()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.calculation_status in ('queued','calculating')
    and old.calculation_status not in ('queued','calculating') then
    new.calculation_revision=old.calculation_revision+1;
    if new.version <= old.version then
      new.version=old.version+1;
    end if;
  elsif new.calculation_revision <> old.calculation_revision then
    raise exception 'Calculation revision can only change when a new calculation starts'
      using errcode='check_violation';
  end if;
  return new;
end; $$;

create trigger route_plans_calculation_revision
before update on public.route_plans
for each row execute function public.enforce_route_plan_calculation_revision();
create trigger route_plans_updated_at before update on public.route_plans
for each row execute function public.set_routing_updated_at();
create trigger technician_routes_updated_at before update on public.technician_routes
for each row execute function public.set_routing_updated_at();
create trigger route_stops_updated_at before update on public.route_stops
for each row execute function public.set_routing_updated_at();
create trigger route_legs_updated_at before update on public.route_legs
for each row execute function public.set_routing_updated_at();

-- Route records are derived, so source scheduling mutations invalidate matching
-- daily plans. Existing geometry remains available but is explicitly stale.
create or replace function public.mark_route_plan_stale(
  p_business_id uuid,
  p_service_date date
) returns void
language sql
security definer
set search_path=public
as $$
  update public.route_plans
  set calculation_status='stale',
      stale_at=now(),
      version=version+1,
      updated_at=now()
  where business_id=p_business_id
    and service_date=p_service_date
    and status <> 'archived';
$$;
revoke all on function public.mark_route_plan_stale(uuid,date) from public;
grant execute on function public.mark_route_plan_stale(uuid,date) to service_role;

create or replace function public.mark_job_route_plan_stale()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_timezone text;
begin
  if tg_op='UPDATE' and not (
    new.business_id is distinct from old.business_id
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.arrival_window_start is distinct from old.arrival_window_start
    or new.arrival_window_end is distinct from old.arrival_window_end
    or new.estimated_duration_minutes is distinct from old.estimated_duration_minutes
    or new.service_location_id is distinct from old.service_location_id
    or new.service_address is distinct from old.service_address
    or new.assigned_technician_id is distinct from old.assigned_technician_id
    or new.status is distinct from old.status
    or new.is_deleted is distinct from old.is_deleted
  ) then
    return new;
  end if;

  if tg_op in ('UPDATE','DELETE') and old.starts_at is not null then
    select timezone into v_timezone from public.businesses where id=old.business_id;
    perform public.mark_route_plan_stale(
      old.business_id,
      (old.starts_at at time zone coalesce(v_timezone,'UTC'))::date
    );
  end if;
  if tg_op in ('INSERT','UPDATE') and new.starts_at is not null then
    select timezone into v_timezone from public.businesses where id=new.business_id;
    perform public.mark_route_plan_stale(
      new.business_id,
      (new.starts_at at time zone coalesce(v_timezone,'UTC'))::date
    );
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.mark_job_route_plan_stale() from public;

create trigger jobs_mark_route_plan_stale
after insert or update or delete on public.jobs
for each row execute function public.mark_job_route_plan_stale();

create or replace function public.mark_assignment_route_plan_stale()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_job_id uuid;
  v_business_id uuid;
  v_starts_at timestamptz;
  v_timezone text;
begin
  v_job_id=case when tg_op='DELETE' then old.job_id else new.job_id end;
  v_business_id=case when tg_op='DELETE' then old.business_id else new.business_id end;
  select j.starts_at,b.timezone into v_starts_at,v_timezone
  from public.jobs j
  join public.businesses b on b.id=j.business_id
  where j.id=v_job_id and j.business_id=v_business_id;
  if v_starts_at is not null then
    perform public.mark_route_plan_stale(
      v_business_id,
      (v_starts_at at time zone coalesce(v_timezone,'UTC'))::date
    );
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.mark_assignment_route_plan_stale() from public;

create trigger job_assignments_mark_route_plan_stale
after insert or update or delete on public.job_assignments
for each row execute function public.mark_assignment_route_plan_stale();

create or replace function public.mark_location_route_plans_stale()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if not (
    new.street_address is distinct from old.street_address
    or new.unit is distinct from old.unit
    or new.city is distinct from old.city
    or new.state is distinct from old.state
    or new.postal_code is distinct from old.postal_code
    or new.country is distinct from old.country
    or new.google_place_id is distinct from old.google_place_id
    or new.latitude is distinct from old.latitude
    or new.longitude is distinct from old.longitude
    or new.is_active is distinct from old.is_active
    or new.is_deleted is distinct from old.is_deleted
  ) then
    return new;
  end if;

  update public.route_plans rp
  set calculation_status='stale',
      stale_at=now(),
      version=version+1,
      updated_at=now()
  where rp.business_id=new.business_id
    and rp.status <> 'archived'
    and exists (
      select 1
      from public.jobs j
      join public.businesses b on b.id=j.business_id
      where j.business_id=new.business_id
        and j.service_location_id=new.id
        and j.starts_at is not null
        and (j.starts_at at time zone coalesce(b.timezone,'UTC'))::date=rp.service_date
    );
  return new;
end; $$;
revoke all on function public.mark_location_route_plans_stale() from public;

create trigger service_locations_mark_route_plans_stale
after update on public.service_locations
for each row execute function public.mark_location_route_plans_stale();

-- A route plan date is interpreted in the business time zone captured at plan
-- creation. Prevent cross-business or incorrect-timezone snapshots.
create or replace function public.validate_route_plan_business_timezone()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_timezone text;
begin
  select timezone into v_timezone from public.businesses where id=new.business_id;
  if v_timezone is null or new.business_timezone <> v_timezone then
    raise exception 'Route plan timezone must match the current business timezone'
      using errcode='check_violation';
  end if;
  return new;
end; $$;
create trigger route_plans_validate_business_timezone
before insert on public.route_plans
for each row execute function public.validate_route_plan_business_timezone();

-- Assigned technicians may read only their own derived route. Office roles
-- retain operational control. This helper is security-definer so nested RLS
-- checks do not recurse.
create or replace function public.technician_can_access_route(
  p_business_id uuid,
  p_technician_route_id uuid
) returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from public.technician_routes tr
    join public.technician_profiles tp
      on tp.id=tr.technician_id
     and tp.business_id=tr.business_id
    where tr.id=p_technician_route_id
      and tr.business_id=p_business_id
      and tp.member_user_id=auth.uid()
      and tp.is_active=true
      and tp.is_technician=true
  );
$$;
revoke all on function public.technician_can_access_route(uuid,uuid) from public;
grant execute on function public.technician_can_access_route(uuid,uuid)
  to authenticated,service_role;

alter table public.route_plans enable row level security;
alter table public.technician_routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.route_legs enable row level security;
alter table public.route_optimization_runs enable row level security;
alter table public.route_suggestions enable row level security;

create policy "routing office manages route plans" on public.route_plans
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "technicians read own route plans" on public.route_plans
  for select to authenticated using (
    exists (
      select 1 from public.technician_routes tr
      where tr.business_id=route_plans.business_id
        and tr.route_plan_id=route_plans.id
        and public.technician_can_access_route(tr.business_id,tr.id)
    )
  );

create policy "routing office manages technician routes" on public.technician_routes
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "technicians read own technician routes" on public.technician_routes
  for select to authenticated
  using (public.technician_can_access_route(business_id,id));

create policy "routing office manages route stops" on public.route_stops
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "technicians read own route stops" on public.route_stops
  for select to authenticated
  using (
    public.technician_can_access_route(business_id,technician_route_id)
    and public.is_assigned_technician(business_id,job_id)
  );

create policy "routing office manages route legs" on public.route_legs
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "technicians read own route legs" on public.route_legs
  for select to authenticated
  using (public.technician_can_access_route(business_id,technician_route_id));

create policy "routing office manages optimization runs" on public.route_optimization_runs
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "routing office manages suggestions" on public.route_suggestions
  for all to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));

commit;
