-- Epic 5 Checkpoint 1.1 historical-integrity audit
--
-- Run AFTER 20260723000100_epic_5_checkpoint_1_field_service_foundation.sql.
-- Every count must be zero before validating the NOT VALID constraints.
-- This script is read-only and safe to run repeatedly.

-- Summary suitable for a release checklist.
select 'jobs_customer_tenant_fk' as constraint_name,count(*) as violating_rows
from public.jobs j
where j.customer_id is not null
  and not exists (
    select 1 from public.customers c
    where c.id=j.customer_id and c.business_id=j.business_id
  )
union all
select 'jobs_service_tenant_fk',count(*)
from public.jobs j
where j.service_id is not null
  and not exists (
    select 1 from public.services s
    where s.id=j.service_id and s.business_id=j.business_id
  )
union all
select 'jobs_service_location_tenant_fk',count(*)
from public.jobs j
where j.service_location_id is not null
  and not exists (
    select 1 from public.service_locations l
    where l.id=j.service_location_id and l.business_id=j.business_id
  )
union all
select 'jobs_technician_tenant_fk',count(*)
from public.jobs j
where j.assigned_technician_id is not null
  and not exists (
    select 1 from public.technician_profiles t
    where t.id=j.assigned_technician_id and t.business_id=j.business_id
  )
union all
select 'job_status_history_job_tenant_fk',count(*)
from public.job_status_history h
where not exists (
  select 1 from public.jobs j
  where j.id=h.job_id and j.business_id=h.business_id
)
order by constraint_name;

-- Detailed violating IDs. These intentionally exclude customer contact data,
-- addresses, job notes, and other sensitive fields.
select 'jobs_customer_tenant_fk' as constraint_name,
  j.id as row_id,j.business_id,j.customer_id as referenced_id
from public.jobs j
where j.customer_id is not null
  and not exists (
    select 1 from public.customers c
    where c.id=j.customer_id and c.business_id=j.business_id
  )
union all
select 'jobs_service_tenant_fk',j.id,j.business_id,j.service_id
from public.jobs j
where j.service_id is not null
  and not exists (
    select 1 from public.services s
    where s.id=j.service_id and s.business_id=j.business_id
  )
union all
select 'jobs_service_location_tenant_fk',j.id,j.business_id,j.service_location_id
from public.jobs j
where j.service_location_id is not null
  and not exists (
    select 1 from public.service_locations l
    where l.id=j.service_location_id and l.business_id=j.business_id
  )
union all
select 'jobs_technician_tenant_fk',j.id,j.business_id,j.assigned_technician_id
from public.jobs j
where j.assigned_technician_id is not null
  and not exists (
    select 1 from public.technician_profiles t
    where t.id=j.assigned_technician_id and t.business_id=j.business_id
  )
union all
select 'job_status_history_job_tenant_fk',h.id,h.business_id,h.job_id
from public.job_status_history h
where not exists (
  select 1 from public.jobs j
  where j.id=h.job_id and j.business_id=h.business_id
)
order by constraint_name,row_id;

-- Primary-assignment cache audit. This is not a NOT VALID FK, but it confirms
-- jobs.assigned_technician_id matches the authoritative active-primary row.
select j.id as job_id,j.business_id,j.assigned_technician_id,
  a.technician_id as authoritative_primary_technician_id
from public.jobs j
left join public.job_assignments a
  on a.business_id=j.business_id
 and a.job_id=j.id
 and a.assignment_role='primary'
 and a.is_active=true
where j.assigned_technician_id is distinct from a.technician_id
order by j.business_id,j.id;

-- Run these only after both violation queries above return no rows/counts.
-- Keep validation as a reviewed deployment step; do not uncomment blindly.
--
-- alter table public.jobs validate constraint jobs_customer_tenant_fk;
-- alter table public.jobs validate constraint jobs_service_tenant_fk;
-- alter table public.jobs validate constraint jobs_service_location_tenant_fk;
-- alter table public.jobs validate constraint jobs_technician_tenant_fk;
-- alter table public.job_status_history
--   validate constraint job_status_history_job_tenant_fk;
