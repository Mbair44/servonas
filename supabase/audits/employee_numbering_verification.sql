-- Employee numbering post-migration verification.
-- Run after 20260728000900_configurable_employee_numbering.sql.

select count(*) as businesses_missing_numbering_settings
from public.businesses b
left join public.employee_numbering_settings s on s.business_id = b.id
where s.business_id is null;

select business_id, lower(employee_number) as normalized_number, count(*) as duplicate_count
from public.employees
where employee_number is not null
group by business_id, lower(employee_number)
having count(*) > 1;

select business_id, prefix, starting_number, next_number, minimum_digits
from public.employee_numbering_settings
where starting_number < 1
   or next_number < 1
   or minimum_digits not between 1 and 10
   or length(prefix) > 10
   or prefix !~ '^[A-Za-z0-9_-]*$';

select
 to_regprocedure('public.assign_employee_number()') is not null as allocator_exists,
 to_regprocedure('public.update_employee_numbering_settings(uuid,boolean,text,bigint,bigint,smallint,boolean)') is not null as settings_rpc_exists,
 exists(
  select 1 from pg_trigger
  where tgname = 'employees_assign_employee_number' and not tgisinternal
 ) as allocation_trigger_exists;
