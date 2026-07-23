-- Read-only Epic 5 migration status audit.
-- Run in the Supabase SQL Editor. A false result means the corresponding
-- migration (or at least part of it) has not been applied.
select *
from (values
  ('001 checkpoint 1 foundation',
    to_regclass('public.service_locations') is not null
    and to_regclass('public.technician_profiles') is not null
    and to_regclass('public.job_assignments') is not null),
  ('002 checkpoint 1 constraint validation',
    coalesce((
      select bool_and(convalidated)
      from pg_constraint
      where conname in (
        'jobs_customer_tenant_fk',
        'jobs_service_tenant_fk',
        'jobs_service_location_tenant_fk',
        'jobs_technician_tenant_fk'
      )
    ), false)),
  ('003 checkpoint 3 idempotency and photos',
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='jobs' and column_name='request_key'
    )
    and to_regclass('public.job_photos') is not null),
  ('004 public booking branding',
    exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='booking_settings' and column_name='logo_path'
    )),
  ('005 invitation acceptance fix',
    to_regprocedure('public.accept_business_invitation(uuid)') is not null),
  ('006 technician assigned-job access',
    to_regprocedure('public.is_assigned_technician(uuid,uuid)') is not null
    and to_regprocedure('public.transition_assigned_job_status(uuid,text)') is not null),
  ('007 notes, timeline, and typed photos',
    to_regclass('public.job_notes') is not null
    and to_regclass('public.job_timeline_events') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='job_photos' and column_name='photo_type'
    )),
  ('008 technician time off',
    to_regclass('public.technician_time_off') is not null)
) as migration_status(migration, applied)
order by migration;
