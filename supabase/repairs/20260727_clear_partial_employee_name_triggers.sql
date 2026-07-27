-- Run this only when a partial manual installation reports:
--   record "new" has no field "author_employee_id"
--
-- It removes only the orphaned preferred-name attribution triggers. The main
-- migration recreates them after the required columns exist.
begin;

do $$
begin
  if to_regclass('public.job_notes') is not null then
    execute 'drop trigger if exists job_notes_link_employee on public.job_notes';
  end if;
  if to_regclass('public.job_timeline_events') is not null then
    execute 'drop trigger if exists job_timeline_link_employee on public.job_timeline_events';
  end if;
end
$$;

drop function if exists public.link_job_event_employee();

commit;
