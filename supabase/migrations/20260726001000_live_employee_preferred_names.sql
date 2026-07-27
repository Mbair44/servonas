begin;

-- Ordinary employees need read access to their own identity so technician
-- screens can resolve the same preferred-name foreign record as office screens.
create policy "employees read own employee identity" on public.employees
  for select to authenticated using(auth_user_id=auth.uid());

create view public.technician_directory
with (security_invoker=true) as
select
  profile.id,
  profile.business_id,
  profile.member_user_id,
  profile.employee_id,
  employee.preferred_name,
  employee.profile_photo_url,
  coalesce(employee.phone,profile.phone) as phone,
  profile.is_active,
  profile.is_technician,
  profile.technician_status,
  profile.schedule_color,
  profile.skills,
  profile.service_areas,
  profile.default_working_hours,
  profile.can_be_assigned_jobs,
  profile.routing_capabilities,
  profile.created_at,
  profile.updated_at
from public.technician_profiles profile
join public.employees employee
  on employee.business_id=profile.business_id and employee.id=profile.employee_id;

comment on view public.technician_directory is
  'Live technician directory. preferred_name always comes through the employee foreign key and never from an email or duplicated profile label.';
revoke all on public.technician_directory from anon;
grant select on public.technician_directory to authenticated;

-- Keep the legacy NOT NULL column compatible for database routines that have
-- not yet moved to technician_directory. It is not the application source of
-- truth; employee.preferred_name is.
create or replace function public.sync_employee_preferred_name()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.technician_profiles
  set display_name=new.preferred_name, updated_at=now()
  where business_id=new.business_id and employee_id=new.id
    and display_name is distinct from new.preferred_name;
  return new;
end $$;
create trigger employees_sync_technician_legacy_name
after update of preferred_name on public.employees
for each row execute function public.sync_employee_preferred_name();
revoke all on function public.sync_employee_preferred_name() from public;

-- NOT VALID allows this migration to install without claiming historical
-- integrity. It still prevents new active technician records from being
-- created without their employee foreign record.
alter table public.technician_profiles
  add constraint technician_profiles_employee_required_check
  check(not is_technician or employee_id is not null) not valid;

alter table public.job_notes add column author_employee_id uuid;
alter table public.job_notes add constraint job_notes_author_employee_fk
  foreign key(business_id,author_employee_id)
  references public.employees(business_id,id) on delete restrict;
create index job_notes_author_employee_idx
  on public.job_notes(business_id,author_employee_id)
  where author_employee_id is not null;

alter table public.job_timeline_events add column actor_employee_id uuid;
alter table public.job_timeline_events add constraint job_timeline_actor_employee_fk
  foreign key(business_id,actor_employee_id)
  references public.employees(business_id,id) on delete restrict;
create index job_timeline_actor_employee_idx
  on public.job_timeline_events(business_id,actor_employee_id)
  where actor_employee_id is not null;

update public.job_notes note set author_employee_id=employee.id
from public.employees employee
where employee.business_id=note.business_id
  and employee.auth_user_id=note.author_id
  and note.author_employee_id is null;

update public.job_timeline_events event set actor_employee_id=employee.id
from public.employees employee
where employee.business_id=event.business_id
  and employee.auth_user_id=event.actor_id
  and event.actor_employee_id is null;

create or replace function public.link_job_event_employee()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='job_notes' and new.author_employee_id is null and new.author_id is not null then
    select employee.id into new.author_employee_id
    from public.employees employee
    where employee.business_id=new.business_id and employee.auth_user_id=new.author_id;
  elsif tg_table_name='job_timeline_events' and new.actor_employee_id is null and new.actor_id is not null then
    select employee.id into new.actor_employee_id
    from public.employees employee
    where employee.business_id=new.business_id and employee.auth_user_id=new.actor_id;
  end if;
  return new;
end $$;
create trigger job_notes_link_employee
before insert or update of author_id,business_id on public.job_notes
for each row execute function public.link_job_event_employee();
create trigger job_timeline_link_employee
before insert or update of actor_id,business_id on public.job_timeline_events
for each row execute function public.link_job_event_employee();
revoke all on function public.link_job_event_employee() from public;

commit;
