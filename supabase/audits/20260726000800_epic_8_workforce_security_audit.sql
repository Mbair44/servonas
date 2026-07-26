-- Epic 8 Workforce Intelligence security and integrity audit
-- Run after all Epic 8 migrations. Orphan and cross-tenant counts must be zero.

select count(*) as orphan_workforce_history_rows
from public.workforce_history_events history
left join public.employees employee
  on employee.business_id=history.business_id and employee.id=history.employee_id
where employee.id is null;

select count(*) as cross_tenant_metric_rows
from public.workforce_metric_facts fact
join public.employees employee on employee.id=fact.employee_id
where employee.business_id<>fact.business_id;

select count(*) as cross_tenant_asset_assignment_rows
from public.employee_asset_assignments assignment
join public.employees employee on employee.id=assignment.employee_id
join public.workforce_assets asset on asset.id=assignment.asset_id
where employee.business_id<>assignment.business_id
   or asset.business_id<>assignment.business_id;

select count(*) as cross_tenant_territory_assignment_rows
from public.employee_territory_assignments assignment
join public.employees employee on employee.id=assignment.employee_id
join public.workforce_territories territory on territory.id=assignment.territory_id
where employee.business_id<>assignment.business_id
   or territory.business_id<>assignment.business_id;

select tablename,rowsecurity
from pg_tables
where schemaname='public' and tablename in (
  'employees','employee_availability_profiles','employee_weekly_intervals',
  'employee_availability_exceptions','workforce_qualifications',
  'employee_qualifications','workforce_territories',
  'employee_territory_assignments','workforce_assets',
  'employee_asset_assignments','workforce_metric_facts',
  'employee_scheduling_preferences','customer_employee_preferences',
  'workforce_decision_signals','workforce_history_events'
)
order by tablename;

select tablename,policyname,cmd,roles
from pg_policies
where schemaname='public' and tablename in (
  'employees','employee_availability_profiles','employee_weekly_intervals',
  'employee_availability_exceptions','workforce_qualifications',
  'employee_qualifications','workforce_territories',
  'employee_territory_assignments','workforce_assets',
  'employee_asset_assignments','workforce_metric_facts',
  'employee_scheduling_preferences','customer_employee_preferences',
  'workforce_decision_signals','workforce_history_events'
)
order by tablename,policyname;

-- History coverage by source. Bootstrap is migration-time state, not proof of
-- earlier state. New changes should create changed/ended/deleted rows.
select entity_type,event_type,count(*) as event_count
from public.workforce_history_events
group by entity_type,event_type
order by entity_type,event_type;
