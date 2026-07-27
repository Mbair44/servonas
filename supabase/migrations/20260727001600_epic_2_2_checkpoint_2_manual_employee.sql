begin;

alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists job_title text,
  add column if not exists employee_type text,
  add column if not exists employment_status text,
  add column if not exists manager_employee_id uuid;

update public.employees
set employment_status=case when is_active then 'active' else 'inactive' end
where employment_status is null;

alter table public.employees
  alter column employment_status set default 'active',
  alter column employment_status set not null;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='employees_first_name_check') then
  alter table public.employees add constraint employees_first_name_check check(first_name is null or length(btrim(first_name)) between 1 and 100);
 end if;
 if not exists(select 1 from pg_constraint where conname='employees_last_name_check') then
  alter table public.employees add constraint employees_last_name_check check(last_name is null or length(btrim(last_name)) between 1 and 100);
 end if;
 if not exists(select 1 from pg_constraint where conname='employees_job_title_check') then
  alter table public.employees add constraint employees_job_title_check check(job_title is null or length(btrim(job_title)) between 1 and 120);
 end if;
 if not exists(select 1 from pg_constraint where conname='employees_type_check') then
  alter table public.employees add constraint employees_type_check check(employee_type is null or employee_type in ('technician','dispatcher','office_staff','sales','manager','owner','other'));
 end if;
 if not exists(select 1 from pg_constraint where conname='employees_employment_status_check') then
  alter table public.employees add constraint employees_employment_status_check check(employment_status in ('active','inactive','leave','terminated'));
 end if;
 if not exists(select 1 from pg_constraint where conname='employees_manager_tenant_fk') then
  alter table public.employees add constraint employees_manager_tenant_fk foreign key(business_id,manager_employee_id) references public.employees(business_id,id);
 end if;
 if not exists(select 1 from pg_constraint where conname='employees_manager_not_self_check') then
  alter table public.employees add constraint employees_manager_not_self_check check(manager_employee_id is null or manager_employee_id<>id);
 end if;
end $$;

create index if not exists employees_business_manager_idx on public.employees(business_id,manager_employee_id)
where manager_employee_id is not null;

create table if not exists public.employee_activation_events(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null,
 employee_id uuid not null,
 event_type text not null check(event_type in ('employee_created','employee_updated','status_changed','invitation_requested')),
 actor_user_id uuid references auth.users(id) on delete set null,
 metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),
 occurred_at timestamptz not null default now(),
 constraint employee_activation_events_employee_fk foreign key(business_id,employee_id) references public.employees(business_id,id) on delete cascade
);
create index if not exists employee_activation_events_timeline_idx on public.employee_activation_events(business_id,occurred_at desc);
alter table public.employee_activation_events enable row level security;
drop policy if exists "office reads employee activation events" on public.employee_activation_events;
create policy "office reads employee activation events" on public.employee_activation_events for select to authenticated
using(public.has_business_role(business_id,array['owner','admin','manager']));

create or replace function public.capture_employee_creation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.employee_activation_events(business_id,employee_id,event_type,actor_user_id,metadata)
 values(new.business_id,new.id,'employee_created',coalesce(new.created_by,auth.uid()),jsonb_build_object('source','manual_or_system'));
 return new;
end $$;
drop trigger if exists employees_capture_creation on public.employees;
create trigger employees_capture_creation after insert on public.employees
for each row execute function public.capture_employee_creation();

create or replace function public.guard_employee_activation_events()
returns trigger language plpgsql as $$begin raise exception 'Employee activation history is immutable' using errcode='23514';end$$;
drop trigger if exists employee_activation_events_immutable on public.employee_activation_events;
create trigger employee_activation_events_immutable before update or delete on public.employee_activation_events
for each row execute function public.guard_employee_activation_events();
revoke all on function public.capture_employee_creation() from public;
revoke all on function public.guard_employee_activation_events() from public;

create or replace function public.synchronize_employee_lifecycle()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.employment_status='active' then
  new.is_active:=true;
  new.termination_date:=null;
 elsif new.employment_status in ('inactive','leave') then
  new.is_active:=false;
 elsif new.employment_status='terminated' then
  new.is_active:=false;
  new.termination_date:=coalesce(new.termination_date,current_date);
 end if;
 return new;
end $$;

drop trigger if exists employees_synchronize_lifecycle on public.employees;
create trigger employees_synchronize_lifecycle before insert or update of employment_status
on public.employees for each row execute function public.synchronize_employee_lifecycle();

comment on column public.employees.preferred_name is 'Authoritative live display name used throughout Servonas.';
comment on column public.employees.employee_type is 'Work category, separate from workforce roles and authenticated workspace access.';
comment on column public.employees.employment_status is 'Authoritative employee lifecycle; the legacy is_active flag is synchronized for compatibility.';

notify pgrst,'reload schema';
commit;
