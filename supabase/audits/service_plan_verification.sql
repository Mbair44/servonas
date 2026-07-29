-- Run after 20260728001100_recurring_service_plans.sql.
select count(*) as duplicate_occurrences
from(
 select business_id,service_plan_id,occurrence_date,occurrence_type
 from public.service_plan_occurrences
 group by business_id,service_plan_id,occurrence_date,occurrence_type
 having count(*)>1
) duplicates;

select count(*) as duplicate_generated_jobs
from(
 select business_id,service_plan_occurrence_id
 from public.jobs
 where service_plan_occurrence_id is not null
 group by business_id,service_plan_occurrence_id
 having count(*)>1
) duplicates;

select count(*) as cross_tenant_plan_links
from public.recurring_service_series p
left join public.customers c on c.business_id=p.business_id and c.id=p.customer_id
left join public.service_locations l on l.business_id=p.business_id and l.id=p.service_location_id
where c.id is null or l.id is null;

select
 to_regclass('public.service_plan_occurrences') is not null as occurrences_ready,
 to_regclass('public.service_plan_audit_events') is not null as audit_ready,
 to_regprocedure('public.generate_service_plan_jobs(uuid,integer)') is not null as generator_ready,
 to_regprocedure('public.service_plan_occurrence_date(date,integer,text,integer)') is not null as calculator_ready;
