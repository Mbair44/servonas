-- Servonas Epic 5, Checkpoint 1.1: field-service domain model and tenant security.
-- Forward-only migration. Public booking remains compatible because all new job
-- relationships are nullable and existing status/source values are retained.
create extension if not exists "pgcrypto";

-- This repository's pre-Epic-5 schema was historically applied from SQL files
-- outside supabase/migrations. Fail early with a useful message when a target
-- has not received that foundation, instead of failing midway through this
-- migration.
do $$
begin
  if to_regclass('public.businesses') is null
    or to_regclass('public.business_members') is null
    or to_regclass('public.customers') is null
    or to_regclass('public.services') is null
    or to_regclass('public.jobs') is null
    or to_regclass('public.job_status_history') is null then
    raise exception
      'Epic 5 Checkpoint 1 requires the existing Servonas schema through Epic 4.5';
  end if;
  if to_regprocedure('public.is_business_member(uuid)') is null
    or to_regprocedure('public.has_business_role(uuid,text[])') is null then
    raise exception
      'Epic 5 Checkpoint 1 requires the existing tenant authorization helpers';
  end if;
end $$;

-- Composite unique indexes are used by tenant-bound foreign keys below. They
-- prevent a valid record ID from another business being attached accidentally.
create unique index if not exists customers_business_id_id_unique
  on public.customers(business_id,id);
create unique index if not exists services_business_id_id_unique
  on public.services(business_id,id);
create unique index if not exists jobs_business_id_id_unique
  on public.jobs(business_id,id);

-- Customer CRM extensions. Existing first/last name, email, phone, notes,
-- timestamps, audit users, and soft-delete fields are intentionally reused.
alter table public.customers
  add column if not exists company_name text,
  add column if not exists secondary_phone text,
  add column if not exists preferred_contact_method text not null default 'email',
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists lead_source text,
  add column if not exists is_active boolean not null default true;

alter table public.customers drop constraint if exists customers_preferred_contact_method_check;
alter table public.customers add constraint customers_preferred_contact_method_check
  check (preferred_contact_method in ('email','phone','sms','none'));

create index if not exists customers_business_active_name_idx
  on public.customers(business_id,is_active,lower(last_name),lower(first_name))
  where is_deleted=false;
create index if not exists customers_business_company_idx
  on public.customers(business_id,lower(company_name))
  where company_name is not null and is_deleted=false;
create index if not exists customers_business_phone_idx
  on public.customers(business_id,phone)
  where phone is not null and is_deleted=false;

-- A customer may own multiple tenant-scoped properties/service locations.
create table if not exists public.service_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  location_name text not null default 'Primary location',
  street_address text not null,
  unit text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'US',
  google_place_id text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  access_instructions text,
  gate_code text,
  parking_notes text,
  pets_present boolean,
  property_notes text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  is_deleted boolean not null default false,
  constraint service_locations_customer_tenant_fk
    foreign key (business_id,customer_id)
    references public.customers(business_id,id) on delete cascade,
  constraint service_locations_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint service_locations_longitude_check
    check (longitude is null or longitude between -180 and 180)
);
create unique index if not exists service_locations_business_id_id_unique
  on public.service_locations(business_id,id);
create index if not exists service_locations_business_customer_idx
  on public.service_locations(business_id,customer_id)
  where is_deleted=false;
create index if not exists service_locations_business_active_idx
  on public.service_locations(business_id,is_active)
  where is_deleted=false;
create unique index if not exists service_locations_one_primary_per_customer
  on public.service_locations(business_id,customer_id)
  where is_primary=true and is_active=true and is_deleted=false;
create index if not exists service_locations_google_place_idx
  on public.service_locations(business_id,google_place_id)
  where google_place_id is not null and is_deleted=false;

-- Technician data extends a membership without duplicating auth identities.
-- A member can exist without being a technician.
create table if not exists public.technician_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  member_user_id uuid not null,
  display_name text not null,
  phone text,
  is_active boolean not null default true,
  is_technician boolean not null default true,
  technician_status text not null default 'available',
  schedule_color text not null default '#2563eb',
  skills text[] not null default '{}'::text[],
  service_areas text[] not null default '{}'::text[],
  default_working_hours jsonb not null default '{}'::jsonb,
  can_be_assigned_jobs boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint technician_profiles_membership_fk
    foreign key (business_id,member_user_id)
    references public.business_members(business_id,user_id) on delete cascade,
  constraint technician_profiles_business_member_unique
    unique (business_id,member_user_id),
  constraint technician_profiles_status_check
    check (technician_status in ('available','assigned','en_route','on_site','off_duty')),
  constraint technician_profiles_color_check
    check (schedule_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint technician_profiles_hours_object_check
    check (jsonb_typeof(default_working_hours)='object')
);
create unique index if not exists technician_profiles_business_id_id_unique
  on public.technician_profiles(business_id,id);
create index if not exists technician_profiles_business_active_idx
  on public.technician_profiles(business_id,is_active,can_be_assigned_jobs);

-- Extend generalized jobs. starts_at/ends_at remain the canonical scheduled
-- timestamps used by public booking and are not renamed.
alter table public.jobs
  add column if not exists service_location_id uuid,
  add column if not exists assigned_technician_id uuid,
  add column if not exists customer_notes text,
  add column if not exists priority text not null default 'normal',
  add column if not exists arrival_window_start timestamptz,
  add column if not exists arrival_window_end timestamptz,
  add column if not exists actual_arrival_at timestamptz,
  add column if not exists work_started_at timestamptz,
  add column if not exists work_completed_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists estimated_duration_minutes integer,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists payment_status text not null default 'unpaid';

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (
  status in (
    'draft','pending','confirmed','scheduled','dispatched','en_route',
    'arrived','in_progress','completed','canceled','declined'
  )
);
alter table public.jobs drop constraint if exists jobs_priority_check;
alter table public.jobs add constraint jobs_priority_check
  check (priority in ('low','normal','high','urgent'));
alter table public.jobs drop constraint if exists jobs_payment_status_check;
alter table public.jobs add constraint jobs_payment_status_check
  check (payment_status in ('unpaid','pending','partially_paid','paid','refunded','void'));
alter table public.jobs drop constraint if exists jobs_estimated_duration_check;
alter table public.jobs add constraint jobs_estimated_duration_check
  check (estimated_duration_minutes is null or estimated_duration_minutes between 1 and 10080);
alter table public.jobs drop constraint if exists jobs_discount_amount_check;
alter table public.jobs add constraint jobs_discount_amount_check
  check (discount_amount >= 0);
alter table public.jobs drop constraint if exists jobs_arrival_window_order_check;
alter table public.jobs add constraint jobs_arrival_window_order_check
  check (
    arrival_window_end is null or arrival_window_start is null
    or arrival_window_end >= arrival_window_start
  );

-- Monetary source of truth:
--   subtotal       = pre-tax/pre-discount service amount (legacy column name)
--   tax_amount     = calculated tax
--   discount_amount= reduction applied to the job
--   total_amount   = the only final total; generated and never client-writable
-- net_total_amount was never part of the applied schema and is removed if a
-- development database received an early Checkpoint 1 draft.
alter table public.jobs drop column if exists net_total_amount;
alter table public.jobs drop column if exists total_amount;
alter table public.jobs add column total_amount numeric(12,2)
  generated always as (greatest(subtotal + tax_amount - discount_amount,0)) stored;
comment on column public.jobs.subtotal is
  'Authoritative pre-tax, pre-discount amount. Legacy name retained instead of adding subtotal_amount.';
comment on column public.jobs.tax_amount is
  'Tax amount added to subtotal when calculating total_amount.';
comment on column public.jobs.discount_amount is
  'Discount amount subtracted from subtotal plus tax.';
comment on column public.jobs.total_amount is
  'Authoritative generated final total: greatest(subtotal + tax_amount - discount_amount, 0).';

alter table public.jobs drop constraint if exists jobs_customer_tenant_fk;
alter table public.jobs add constraint jobs_customer_tenant_fk
  foreign key (business_id,customer_id)
  references public.customers(business_id,id)
  not valid;
alter table public.jobs drop constraint if exists jobs_service_tenant_fk;
alter table public.jobs add constraint jobs_service_tenant_fk
  foreign key (business_id,service_id)
  references public.services(business_id,id)
  not valid;
alter table public.jobs drop constraint if exists jobs_service_location_tenant_fk;
alter table public.jobs add constraint jobs_service_location_tenant_fk
  foreign key (business_id,service_location_id)
  references public.service_locations(business_id,id)
  not valid;
alter table public.jobs drop constraint if exists jobs_technician_tenant_fk;
alter table public.jobs add constraint jobs_technician_tenant_fk
  foreign key (business_id,assigned_technician_id)
  references public.technician_profiles(business_id,id)
  not valid;

create index if not exists jobs_business_service_location_idx
  on public.jobs(business_id,service_location_id)
  where service_location_id is not null and is_deleted=false;
create index if not exists jobs_business_technician_schedule_idx
  on public.jobs(business_id,assigned_technician_id,starts_at,ends_at)
  where assigned_technician_id is not null and is_deleted=false and status <> 'canceled';
create index if not exists jobs_business_schedule_idx
  on public.jobs(business_id,starts_at,ends_at)
  where is_deleted=false and status <> 'canceled';
create index if not exists jobs_business_priority_idx
  on public.jobs(business_id,priority)
  where is_deleted=false;

-- Multi-technician assignments coexist with jobs.assigned_technician_id, which
-- is the denormalized primary technician for list/calendar performance.
create table if not exists public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null,
  technician_id uuid not null,
  assignment_role text not null default 'primary',
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  constraint job_assignments_job_tenant_fk
    foreign key (business_id,job_id)
    references public.jobs(business_id,id) on delete cascade,
  constraint job_assignments_technician_tenant_fk
    foreign key (business_id,technician_id)
    references public.technician_profiles(business_id,id) on delete cascade,
  constraint job_assignments_role_check
    check (assignment_role in ('primary','helper','observer')),
  constraint job_assignments_removal_check
    check (
      (is_active=true and removed_at is null)
      or (is_active=false and removed_at is not null)
    )
);
create index if not exists job_assignments_business_job_idx
  on public.job_assignments(business_id,job_id,is_active);
create index if not exists job_assignments_business_technician_idx
  on public.job_assignments(business_id,technician_id,is_active,assigned_at);
create unique index if not exists job_assignments_active_technician_unique
  on public.job_assignments(job_id,technician_id)
  where is_active=true;
create unique index if not exists job_assignments_one_active_primary
  on public.job_assignments(job_id)
  where is_active=true and assignment_role='primary';

-- Primary-assignment source of truth
-- ----------------------------------
-- The active primary job_assignments row is authoritative. The jobs column is
-- a synchronized read cache for calendars and lists. Guard triggers reject
-- one-sided primary-assignment writes; callers must use
-- set_job_primary_technician(), which locks and updates both representations in
-- one database transaction.
create or replace function public.guard_job_primary_technician_write()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_setting('servonas.assignment_sync',true)='on' then
    return new;
  end if;
  if tg_op='INSERT' and new.assigned_technician_id is not null then
    raise exception 'Use set_job_primary_technician() to change the primary technician'
      using errcode='check_violation';
  end if;
  if tg_op='UPDATE'
    and new.assigned_technician_id is distinct from old.assigned_technician_id then
    raise exception 'Use set_job_primary_technician() to change the primary technician'
      using errcode='check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists jobs_primary_technician_write_guard on public.jobs;
create trigger jobs_primary_technician_write_guard
before insert or update on public.jobs
for each row execute function public.guard_job_primary_technician_write();

create or replace function public.guard_primary_job_assignment_write()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_setting('servonas.assignment_sync',true)='on' then
    return new;
  end if;
  if tg_op='INSERT' and new.is_active and new.assignment_role='primary' then
    raise exception 'Use set_job_primary_technician() to change the primary assignment'
      using errcode='check_violation';
  end if;
  if tg_op='UPDATE'
    and (
      (old.is_active and old.assignment_role='primary')
      or (new.is_active and new.assignment_role='primary')
    ) then
    raise exception 'Use set_job_primary_technician() to change the primary assignment'
      using errcode='check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists job_assignments_primary_write_guard on public.job_assignments;
create trigger job_assignments_primary_write_guard
before insert or update on public.job_assignments
for each row execute function public.guard_primary_job_assignment_write();

create or replace function public.set_job_primary_technician(
  p_job_id uuid,
  p_technician_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_business_id uuid;
  v_assignment_id uuid;
begin
  select business_id into v_business_id
  from public.jobs
  where id=p_job_id and is_deleted=false
  for update;

  if v_business_id is null then
    raise exception 'Job not found' using errcode='no_data_found';
  end if;
  if not (
    public.has_business_role(v_business_id,array['owner','admin','manager'])
    or coalesce(auth.role(),'')='service_role'
  ) then
    raise exception 'Permission denied' using errcode='insufficient_privilege';
  end if;
  if p_technician_id is not null and not exists (
    select 1 from public.technician_profiles
    where id=p_technician_id
      and business_id=v_business_id
      and is_active=true
      and is_technician=true
      and can_be_assigned_jobs=true
  ) then
    raise exception 'Technician is not assignable to this job'
      using errcode='foreign_key_violation';
  end if;

  perform set_config('servonas.assignment_sync','on',true);

  update public.job_assignments
  set is_active=false,removed_at=now(),removed_by=auth.uid()
  where business_id=v_business_id
    and job_id=p_job_id
    and assignment_role='primary'
    and is_active=true;

  if p_technician_id is not null then
    update public.job_assignments
    set assignment_role='primary'
    where business_id=v_business_id
      and job_id=p_job_id
      and technician_id=p_technician_id
      and is_active=true
    returning id into v_assignment_id;

    if v_assignment_id is null then
      insert into public.job_assignments(
        business_id,job_id,technician_id,assignment_role,assigned_by
      ) values (
        v_business_id,p_job_id,p_technician_id,'primary',auth.uid()
      )
      returning id into v_assignment_id;
    end if;
  end if;

  update public.jobs
  set assigned_technician_id=p_technician_id,updated_by=auth.uid()
  where id=p_job_id and business_id=v_business_id;

  perform set_config('servonas.assignment_sync','off',true);
  return v_assignment_id;
end; $$;
revoke all on function public.set_job_primary_technician(uuid,uuid) from public;
grant execute on function public.set_job_primary_technician(uuid,uuid)
  to authenticated,service_role;
comment on function public.set_job_primary_technician(uuid,uuid) is
  'Only supported operation for setting, replacing, or clearing a job primary technician.';

-- Existing history is retained and extended with an optional reason. The
-- existing jobs_activity_trigger continues recording every status transition.
alter table public.job_status_history
  add column if not exists change_reason text;
alter table public.job_status_history drop constraint if exists job_status_history_job_tenant_fk;
alter table public.job_status_history add constraint job_status_history_job_tenant_fk
  foreign key (business_id,job_id)
  references public.jobs(business_id,id) on delete cascade
  not valid;
create index if not exists job_status_history_business_changed_idx
  on public.job_status_history(business_id,changed_at desc);

-- Keep updated_at reliable for old and new field-service entities.
create or replace function public.set_field_service_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at=now();
  return new;
end; $$;
drop trigger if exists customers_field_service_updated_at on public.customers;
create trigger customers_field_service_updated_at before update on public.customers
for each row execute function public.set_field_service_updated_at();
drop trigger if exists service_locations_updated_at on public.service_locations;
create trigger service_locations_updated_at before update on public.service_locations
for each row execute function public.set_field_service_updated_at();
drop trigger if exists technician_profiles_updated_at on public.technician_profiles;
create trigger technician_profiles_updated_at before update on public.technician_profiles
for each row execute function public.set_field_service_updated_at();
drop trigger if exists jobs_field_service_updated_at on public.jobs;
create trigger jobs_field_service_updated_at before update on public.jobs
for each row execute function public.set_field_service_updated_at();

-- Tenant-scoped RLS. Authenticated members may read operational records;
-- owners/admins/managers may mutate them. No client-facing delete policies are
-- granted because these entities use archive/soft-delete fields.
alter table public.service_locations enable row level security;
alter table public.technician_profiles enable row level security;
alter table public.job_assignments enable row level security;

drop policy if exists "members can view service locations" on public.service_locations;
create policy "members can view service locations" on public.service_locations
  for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "managers can create service locations" on public.service_locations;
create policy "managers can create service locations" on public.service_locations
  for insert to authenticated with check (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and created_by=auth.uid()
  );
drop policy if exists "managers can update service locations" on public.service_locations;
create policy "managers can update service locations" on public.service_locations
  for update to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));

drop policy if exists "members can view technician profiles" on public.technician_profiles;
create policy "members can view technician profiles" on public.technician_profiles
  for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "managers can create technician profiles" on public.technician_profiles;
create policy "managers can create technician profiles" on public.technician_profiles
  for insert to authenticated with check (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and created_by=auth.uid()
  );
drop policy if exists "managers can update technician profiles" on public.technician_profiles;
create policy "managers can update technician profiles" on public.technician_profiles
  for update to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));

drop policy if exists "members can view job assignments" on public.job_assignments;
create policy "members can view job assignments" on public.job_assignments
  for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "managers can create job assignments" on public.job_assignments;
create policy "managers can create job assignments" on public.job_assignments
  for insert to authenticated with check (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and assigned_by=auth.uid()
  );
drop policy if exists "managers can update job assignments" on public.job_assignments;
create policy "managers can update job assignments" on public.job_assignments
  for update to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));

-- Reassert existing customer/job/history policies explicitly for this model.
drop policy if exists "members can view customers" on public.customers;
create policy "members can view customers" on public.customers
  for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "managers can create customers" on public.customers;
create policy "managers can create customers" on public.customers
  for insert to authenticated with check (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and created_by=auth.uid()
  );
drop policy if exists "managers can update customers" on public.customers;
create policy "managers can update customers" on public.customers
  for update to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));

drop policy if exists "members can view jobs" on public.jobs;
create policy "members can view jobs" on public.jobs
  for select to authenticated using (public.is_business_member(business_id));
drop policy if exists "managers can create jobs" on public.jobs;
create policy "managers can create jobs" on public.jobs
  for insert to authenticated with check (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and created_by=auth.uid()
  );
drop policy if exists "managers can update jobs" on public.jobs;
create policy "managers can update jobs" on public.jobs
  for update to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));

drop policy if exists "members can view job history" on public.job_status_history;
create policy "members can view job history" on public.job_status_history
  for select to authenticated using (public.is_business_member(business_id));
