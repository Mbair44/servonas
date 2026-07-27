-- Employee preferred-name relationship audit
--
-- Run after 20260726001000_live_employee_preferred_names.sql. Do not validate
-- technician_profiles_employee_required_check until every result is zero.

select count(*) as active_technicians_without_employee_id
from public.technician_profiles
where is_technician and employee_id is null;

select count(*) as technician_employee_foreign_key_mismatches
from public.technician_profiles profile
left join public.employees employee
  on employee.business_id=profile.business_id and employee.id=profile.employee_id
where profile.employee_id is not null and employee.id is null;

select count(*) as employee_names_missing_from_live_directory
from public.technician_profiles profile
join public.employees employee
  on employee.business_id=profile.business_id and employee.id=profile.employee_id
left join public.technician_directory directory on directory.id=profile.id
where directory.preferred_name is distinct from employee.preferred_name;

select count(*) as notes_with_unresolved_employee_author
from public.job_notes note
join public.employees employee
  on employee.business_id=note.business_id and employee.auth_user_id=note.author_id
where note.author_id is not null and note.author_employee_id is distinct from employee.id;

select count(*) as timeline_events_with_unresolved_employee_actor
from public.job_timeline_events event
join public.employees employee
  on employee.business_id=event.business_id and employee.auth_user_id=event.actor_id
where event.actor_id is not null and event.actor_employee_id is distinct from employee.id;

-- Only after all counts above return zero:
-- alter table public.technician_profiles
--   validate constraint technician_profiles_employee_required_check;
