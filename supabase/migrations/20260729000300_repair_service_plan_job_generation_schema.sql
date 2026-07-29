-- Repair databases where the service-plan function was installed separately
-- from the columns it writes. Safe to run repeatedly.
begin;

alter table public.jobs
  add column if not exists service_plan_occurrence_id uuid,
  add column if not exists occurrence_date date,
  add column if not exists generation_type text,
  add column if not exists service_description_snapshot text,
  add column if not exists recurring_unit_price_snapshot numeric(12,2),
  add column if not exists recurring_taxable_snapshot boolean,
  add column if not exists price_effective_at timestamptz;

alter table public.recurring_service_series
  add column if not exists default_discount numeric(12,2) not null default 0,
  add column if not exists default_fee numeric(12,2) not null default 0,
  add column if not exists default_duration_minutes integer not null default 60,
  add column if not exists initial_service_duration_minutes integer,
  add column if not exists initial_service_description text,
  add column if not exists initial_service_price numeric(12,2) not null default 0,
  add column if not exists recurring_price numeric(12,2) not null default 0,
  add column if not exists taxable boolean not null default false,
  add column if not exists last_generated_through date;

create unique index if not exists jobs_service_plan_occurrence_unique
  on public.jobs(business_id,service_plan_occurrence_id)
  where service_plan_occurrence_id is not null;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.jobs'::regclass
      and conname='jobs_generation_type_check'
  ) then
    alter table public.jobs add constraint jobs_generation_type_check
      check(generation_type is null or generation_type in('initial','recurring','manual','follow_up'));
  end if;
end $$;

-- Fail installation with a precise message if a required relation is absent.
do $$
declare v_missing text[];
begin
  select array_agg(required.name order by required.name) into v_missing
  from (values
    ('service_plan_occurrences'),
    ('service_plan_audit_events'),
    ('recurring_service_series'),
    ('jobs')
  ) required(name)
  where to_regclass('public.'||required.name) is null;
  if cardinality(v_missing)>0 then
    raise exception 'Required recurring-service relations are missing: %',array_to_string(v_missing,', ')
      using errcode='42P01';
  end if;
end $$;

comment on column public.jobs.service_description_snapshot is
  'Service-plan description preserved when the occurrence becomes a job.';
comment on column public.jobs.recurring_unit_price_snapshot is
  'Recurring price preserved when the occurrence becomes a job.';

commit;
