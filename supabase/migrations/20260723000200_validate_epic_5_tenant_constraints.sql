-- Epic 5 Checkpoint 1.1: validate tenant-integrity constraints.
-- Run only after epic_5_checkpoint_1_historical_integrity.sql reports zero
-- violations for every constraint.

do $$
begin
  if exists (
    select 1 from public.jobs j
    where j.customer_id is not null
      and not exists (
        select 1 from public.customers c
        where c.id=j.customer_id and c.business_id=j.business_id
      )
  ) then raise exception 'Cannot validate jobs_customer_tenant_fk'; end if;

  if exists (
    select 1 from public.jobs j
    where j.service_id is not null
      and not exists (
        select 1 from public.services s
        where s.id=j.service_id and s.business_id=j.business_id
      )
  ) then raise exception 'Cannot validate jobs_service_tenant_fk'; end if;

  if exists (
    select 1 from public.jobs j
    where j.service_location_id is not null
      and not exists (
        select 1 from public.service_locations l
        where l.id=j.service_location_id and l.business_id=j.business_id
      )
  ) then raise exception 'Cannot validate jobs_service_location_tenant_fk'; end if;

  if exists (
    select 1 from public.jobs j
    where j.assigned_technician_id is not null
      and not exists (
        select 1 from public.technician_profiles t
        where t.id=j.assigned_technician_id and t.business_id=j.business_id
      )
  ) then raise exception 'Cannot validate jobs_technician_tenant_fk'; end if;

  if exists (
    select 1 from public.job_status_history h
    where not exists (
      select 1 from public.jobs j
      where j.id=h.job_id and j.business_id=h.business_id
    )
  ) then raise exception 'Cannot validate job_status_history_job_tenant_fk'; end if;
end $$;

alter table public.jobs validate constraint jobs_customer_tenant_fk;
alter table public.jobs validate constraint jobs_service_tenant_fk;
alter table public.jobs validate constraint jobs_service_location_tenant_fk;
alter table public.jobs validate constraint jobs_technician_tenant_fk;
alter table public.job_status_history
  validate constraint job_status_history_job_tenant_fk;

-- Verification result: all five rows must report validated=true.
select conname as constraint_name,convalidated as validated
from pg_constraint
where conname in (
  'jobs_customer_tenant_fk',
  'jobs_service_tenant_fk',
  'jobs_service_location_tenant_fk',
  'jobs_technician_tenant_fk',
  'job_status_history_job_tenant_fk'
)
order by conname;
