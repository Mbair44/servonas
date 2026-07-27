-- Run before the Epic 8.5 Checkpoint 5 migration.
-- This query must return no rows before the territory-centric primary unique
-- index can be installed.
select business_id,territory_id,count(*) as active_primary_count,
  array_agg(employee_id order by created_at) as employee_ids
from public.employee_territory_assignments
where assignment_type='primary' and ended_at is null
group by business_id,territory_id
having count(*)>1;

-- Informational integrity checks. Both counts should be zero.
select count(*) as active_assignments_missing_employee
from public.employee_territory_assignments assignment
left join public.employees employee
  on employee.business_id=assignment.business_id and employee.id=assignment.employee_id
where assignment.ended_at is null and employee.id is null;

select count(*) as active_assignments_missing_territory
from public.employee_territory_assignments assignment
left join public.workforce_territories territory
  on territory.business_id=assignment.business_id and territory.id=assignment.territory_id
where assignment.ended_at is null and territory.id is null;
