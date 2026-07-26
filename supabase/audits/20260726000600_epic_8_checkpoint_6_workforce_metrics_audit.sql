-- Epic 8 Checkpoint 6 historical integrity audit
-- Run after 20260726000600_epic_8_checkpoint_6_workforce_metrics.sql.
-- Every query should return zero except the coverage summary, whose counts
-- document legacy records that could not be attributed without guessing.

-- Invalid tenant relationships (must be zero).
select count(*) as invalid_employee_tenant_rows
from public.workforce_metric_facts fact
left join public.employees employee
  on employee.business_id=fact.business_id and employee.id=fact.employee_id
where employee.id is null;

-- Duplicate source facts (must be zero).
select count(*) as duplicate_source_fact_groups from (
  select business_id,employee_id,metric_type,source_type,source_id
  from public.workforce_metric_facts
  group by business_id,employee_id,metric_type,source_type,source_id
  having count(*)>1
) duplicates;

-- Unit/value violations (must be zero).
select count(*) as invalid_metric_value_rows
from public.workforce_metric_facts
where duration_seconds<0 or distance_meters<0
  or rating_value not between 0 and 5
  or currency !~ '^[A-Z]{3}$';

-- Historical completion coverage. Unattributed rows are reported, not guessed.
select
  count(*) filter(where job.assigned_technician_id is not null) as attributable_completed_jobs,
  count(*) filter(where job.assigned_technician_id is null) as unattributed_completed_jobs,
  count(*) filter(where fact.id is not null) as captured_completed_job_facts
from public.jobs job
left join public.workforce_metric_facts fact
  on fact.business_id=job.business_id and fact.job_id=job.id
  and fact.metric_type='job_completed'
where job.status='completed' and not job.is_deleted;

-- Provenance distribution for operational review.
select metric_type,source_type,count(*) as fact_count
from public.workforce_metric_facts
group by metric_type,source_type
order by metric_type,source_type;
