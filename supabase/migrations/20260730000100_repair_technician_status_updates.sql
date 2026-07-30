begin;

-- A status update writes a timeline event. Reinstall the table-specific
-- employee-linking triggers so that a stale shared trigger cannot reference
-- job-note-only columns and roll back an otherwise valid technician update.
drop trigger if exists job_notes_link_employee on public.job_notes;
drop trigger if exists job_timeline_link_employee on public.job_timeline_events;

create or replace function public.link_job_note_employee()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.author_employee_id is null and new.author_id is not null then
    select employee.id
    into new.author_employee_id
    from public.employees employee
    where employee.business_id=new.business_id
      and employee.auth_user_id=new.author_id;
  end if;
  return new;
end
$$;

create or replace function public.link_job_timeline_employee()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.actor_employee_id is null and new.actor_id is not null then
    select employee.id
    into new.actor_employee_id
    from public.employees employee
    where employee.business_id=new.business_id
      and employee.auth_user_id=new.actor_id;
  end if;
  return new;
end
$$;

create trigger job_notes_link_employee
before insert or update of author_id,business_id
on public.job_notes
for each row execute function public.link_job_note_employee();

create trigger job_timeline_link_employee
before insert or update of actor_id,business_id
on public.job_timeline_events
for each row execute function public.link_job_timeline_employee();

drop function if exists public.link_job_event_employee();

revoke all on function public.link_job_note_employee() from public;
revoke all on function public.link_job_timeline_employee() from public;

commit;
