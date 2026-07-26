# Epic 8, Checkpoint 2: Employee Availability

## Source of truth

`employee_availability_profiles`, `employee_weekly_intervals`, and
`employee_availability_exceptions` are the structured workforce availability
source of truth.

- Weekly intervals are local wall-clock values in the employee's IANA time zone.
- One-time exceptions are stored as `timestamptz` UTC instants.
- Daily hour limits are stored as integer minutes.
- Weekly schedules support multiple intervals even though the initial fast-entry
  UI presents one working interval and one break per day.
- Exceptions distinguish PTO, vacation, holidays, sick time, breaks, and other
  overrides without industry-specific assumptions.

The availability save uses one database operation so profile capacity and weekly
intervals change atomically. Structured working hours are mirrored into the
existing `technician_profiles.default_working_hours` JSON only for compatibility.
Job scheduling reads the structured employee calendar when configured and falls
back to legacy technician hours otherwise.

## Security

All availability records carry `business_id` and use composite foreign keys to
the tenant-owned employee. Owners and administrators can write. Managers can
read. Employees with login accounts can read only their own records.

## Apply

```sh
supabase db push
```

Or execute:

`supabase/migrations/20260726000200_epic_8_checkpoint_2_employee_availability.sql`

## Verification

```sql
select count(*) as employees_missing_availability_profile
from public.employees e
left join public.employee_availability_profiles p
  on p.business_id=e.business_id and p.employee_id=e.id
where p.employee_id is null;

select count(*) as invalid_weekly_breaks
from public.employee_weekly_intervals break_interval
where break_interval.interval_type='break'
  and not exists (
    select 1 from public.employee_weekly_intervals work_interval
    where work_interval.business_id=break_interval.business_id
      and work_interval.employee_id=break_interval.employee_id
      and work_interval.weekday=break_interval.weekday
      and work_interval.interval_type='working'
      and work_interval.starts_at<=break_interval.starts_at
      and work_interval.ends_at>=break_interval.ends_at
  );

select count(*) as cross_tenant_availability_rows
from public.employee_availability_profiles profile
left join public.employees employee
  on employee.business_id=profile.business_id
 and employee.id=profile.employee_id
where employee.id is null;
```

All queries should return zero.
