-- Epic 8, Checkpoint 2: tenant-isolated workforce availability.
begin;

create table public.employee_availability_profiles (
  employee_id uuid primary key,
  business_id uuid not null,
  time_zone text not null,
  weekly_schedule_configured boolean not null default false,
  maximum_daily_jobs integer,
  maximum_daily_minutes integer,
  overtime_preference text not null default 'ask',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint employee_availability_employee_tenant_fk
    foreign key(business_id,employee_id) references public.employees(business_id,id) on delete cascade,
  constraint employee_availability_jobs_check
    check(maximum_daily_jobs is null or maximum_daily_jobs between 1 and 100),
  constraint employee_availability_minutes_check
    check(maximum_daily_minutes is null or maximum_daily_minutes between 30 and 1440),
  constraint employee_availability_overtime_check
    check(overtime_preference in ('avoid','ask','allowed','preferred'))
);
create unique index employee_availability_business_employee_unique
  on public.employee_availability_profiles(business_id,employee_id);

create table public.employee_weekly_intervals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  employee_id uuid not null,
  weekday smallint not null,
  interval_type text not null,
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint employee_weekly_employee_tenant_fk
    foreign key(business_id,employee_id) references public.employees(business_id,id) on delete cascade,
  constraint employee_weekly_weekday_check check(weekday between 0 and 6),
  constraint employee_weekly_type_check check(interval_type in ('working','break')),
  constraint employee_weekly_order_check check(ends_at>starts_at)
);
create index employee_weekly_lookup_idx
  on public.employee_weekly_intervals(business_id,employee_id,weekday,interval_type,starts_at);

create table public.employee_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  employee_id uuid not null,
  exception_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  availability_effect text not null default 'unavailable',
  approval_status text not null default 'approved',
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint employee_exception_employee_tenant_fk
    foreign key(business_id,employee_id) references public.employees(business_id,id) on delete cascade,
  constraint employee_exception_type_check
    check(exception_type in ('pto','vacation','holiday','sick','break','other')),
  constraint employee_exception_effect_check
    check(availability_effect in ('available','unavailable')),
  constraint employee_exception_approval_check
    check(approval_status in ('pending','approved','declined','cancelled')),
  constraint employee_exception_order_check check(ends_at>starts_at),
  constraint employee_exception_reason_check check(reason is null or length(reason)<=500)
);
create index employee_exception_lookup_idx
  on public.employee_availability_exceptions(
    business_id,employee_id,approval_status,starts_at,ends_at
  );

alter table public.employee_availability_profiles enable row level security;
alter table public.employee_weekly_intervals enable row level security;
alter table public.employee_availability_exceptions enable row level security;

create policy "office reads availability profiles"
  on public.employee_availability_profiles for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer availability profiles"
  on public.employee_availability_profiles for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "employees read own availability profile"
  on public.employee_availability_profiles for select to authenticated
  using(exists(
    select 1 from public.employees e
    where e.business_id=employee_availability_profiles.business_id
      and e.id=employee_availability_profiles.employee_id
      and e.auth_user_id=auth.uid()
  ));

create policy "office reads weekly intervals"
  on public.employee_weekly_intervals for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer weekly intervals"
  on public.employee_weekly_intervals for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "employees read own weekly intervals"
  on public.employee_weekly_intervals for select to authenticated
  using(exists(
    select 1 from public.employees e
    where e.business_id=employee_weekly_intervals.business_id
      and e.id=employee_weekly_intervals.employee_id
      and e.auth_user_id=auth.uid()
  ));

create policy "office reads availability exceptions"
  on public.employee_availability_exceptions for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer availability exceptions"
  on public.employee_availability_exceptions for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "employees read own availability exceptions"
  on public.employee_availability_exceptions for select to authenticated
  using(exists(
    select 1 from public.employees e
    where e.business_id=employee_availability_exceptions.business_id
      and e.id=employee_availability_exceptions.employee_id
      and e.auth_user_id=auth.uid()
  ));

create trigger employee_availability_profiles_updated_at
before update on public.employee_availability_profiles
for each row execute function public.set_routing_updated_at();
create trigger employee_availability_exceptions_updated_at
before update on public.employee_availability_exceptions
for each row execute function public.set_routing_updated_at();

create or replace function public.validate_employee_availability_timezone()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from pg_timezone_names where name=new.time_zone) then
    raise exception 'Invalid IANA time zone' using errcode='22023';
  end if;
  return new;
end $$;
create trigger employee_availability_validate_timezone
before insert or update of time_zone on public.employee_availability_profiles
for each row execute function public.validate_employee_availability_timezone();

create or replace function public.validate_employee_weekly_interval()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(
    select 1 from public.employee_weekly_intervals existing
    where existing.business_id=new.business_id
      and existing.employee_id=new.employee_id
      and existing.weekday=new.weekday
      and existing.interval_type=new.interval_type
      and existing.id<>new.id
      and existing.starts_at<new.ends_at
      and existing.ends_at>new.starts_at
  ) then
    raise exception 'Weekly intervals of the same type cannot overlap'
      using errcode='23P01';
  end if;
  return new;
end $$;
create trigger employee_weekly_validate_overlap
before insert or update on public.employee_weekly_intervals
for each row execute function public.validate_employee_weekly_interval();

create or replace function public.initialize_employee_availability()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_time_zone text;
begin
  select coalesce(timezone,'UTC') into v_time_zone
  from public.businesses where id=new.business_id;
  insert into public.employee_availability_profiles(
    employee_id,business_id,time_zone,updated_by
  ) values(new.id,new.business_id,v_time_zone,new.updated_by)
  on conflict(employee_id) do nothing;
  return new;
end $$;
create trigger employees_initialize_availability
after insert on public.employees
for each row execute function public.initialize_employee_availability();
revoke all on function public.initialize_employee_availability() from public;

create or replace function public.replace_employee_weekly_intervals(
  p_business_id uuid,
  p_employee_id uuid,
  p_intervals jsonb
) returns void
language plpgsql security invoker set search_path=public as $$
begin
  if jsonb_typeof(p_intervals)<>'array' then
    raise exception 'Weekly intervals must be an array' using errcode='22023';
  end if;

  delete from public.employee_weekly_intervals
  where business_id=p_business_id and employee_id=p_employee_id;

  update public.employee_availability_profiles
  set weekly_schedule_configured=true,updated_by=auth.uid()
  where business_id=p_business_id and employee_id=p_employee_id;

  insert into public.employee_weekly_intervals(
    business_id,employee_id,weekday,interval_type,starts_at,ends_at,created_by
  )
  select p_business_id,p_employee_id,value.weekday,value.interval_type,
    value.starts_at,value.ends_at,auth.uid()
  from jsonb_to_recordset(p_intervals) as value(
    weekday smallint,interval_type text,starts_at time,ends_at time
  );

  if exists(
    select 1
    from public.employee_weekly_intervals break_interval
    where break_interval.business_id=p_business_id
      and break_interval.employee_id=p_employee_id
      and break_interval.interval_type='break'
      and not exists(
        select 1 from public.employee_weekly_intervals work_interval
        where work_interval.business_id=break_interval.business_id
          and work_interval.employee_id=break_interval.employee_id
          and work_interval.weekday=break_interval.weekday
          and work_interval.interval_type='working'
          and work_interval.starts_at<=break_interval.starts_at
          and work_interval.ends_at>=break_interval.ends_at
      )
  ) then
    raise exception 'Every recurring break must fall within working hours'
      using errcode='23514';
  end if;
end $$;
revoke all on function public.replace_employee_weekly_intervals(uuid,uuid,jsonb) from public;
grant execute on function public.replace_employee_weekly_intervals(uuid,uuid,jsonb) to authenticated;

create or replace function public.save_employee_availability(
  p_business_id uuid,
  p_employee_id uuid,
  p_time_zone text,
  p_maximum_daily_jobs integer,
  p_maximum_daily_minutes integer,
  p_overtime_preference text,
  p_intervals jsonb
) returns void
language plpgsql security invoker set search_path=public as $$
begin
  insert into public.employee_availability_profiles(
    employee_id,business_id,time_zone,maximum_daily_jobs,
    maximum_daily_minutes,overtime_preference,updated_by
  ) values(
    p_employee_id,p_business_id,p_time_zone,p_maximum_daily_jobs,
    p_maximum_daily_minutes,p_overtime_preference,auth.uid()
  )
  on conflict(employee_id) do update set
    time_zone=excluded.time_zone,
    maximum_daily_jobs=excluded.maximum_daily_jobs,
    maximum_daily_minutes=excluded.maximum_daily_minutes,
    overtime_preference=excluded.overtime_preference,
    updated_by=auth.uid();

  perform public.replace_employee_weekly_intervals(
    p_business_id,p_employee_id,p_intervals
  );
end $$;
revoke all on function public.save_employee_availability(
  uuid,uuid,text,integer,integer,text,jsonb
) from public;
grant execute on function public.save_employee_availability(
  uuid,uuid,text,integer,integer,text,jsonb
) to authenticated;

-- Preserve technician scheduling compatibility while the structured workforce
-- calendar becomes the source of truth.
create or replace function public.sync_employee_hours_to_technician()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_business_id uuid; v_employee_id uuid; v_hours jsonb;
begin
  v_business_id=coalesce(new.business_id,old.business_id);
  v_employee_id=coalesce(new.employee_id,old.employee_id);
  select coalesce(jsonb_object_agg(day_key,windows),'{}'::jsonb) into v_hours
  from (
    select weekday::text day_key,
      jsonb_agg(jsonb_build_object(
        'start',to_char(starts_at,'HH24:MI'),
        'end',to_char(ends_at,'HH24:MI')
      ) order by starts_at) windows
    from public.employee_weekly_intervals
    where business_id=v_business_id and employee_id=v_employee_id
      and interval_type='working'
    group by weekday
  ) schedule;
  update public.technician_profiles
  set default_working_hours=coalesce(v_hours,'{}'::jsonb),updated_at=now()
  where business_id=v_business_id and employee_id=v_employee_id;
  return coalesce(new,old);
end $$;
create trigger employee_weekly_sync_technician
after insert or update or delete on public.employee_weekly_intervals
for each row execute function public.sync_employee_hours_to_technician();
revoke all on function public.sync_employee_hours_to_technician() from public;

insert into public.employee_availability_profiles(employee_id,business_id,time_zone,updated_by)
select e.id,e.business_id,coalesce(b.timezone,'UTC'),e.updated_by
from public.employees e
join public.businesses b on b.id=e.business_id
on conflict(employee_id) do nothing;

-- Backfill structured hours from the existing technician JSON without removing
-- the legacy compatibility value.
insert into public.employee_weekly_intervals(
  business_id,employee_id,weekday,interval_type,starts_at,ends_at,created_by
)
select tp.business_id,tp.employee_id,key::smallint,'working',
  coalesce(value->>'start',value->>'start_time')::time,
  coalesce(value->>'end',value->>'end_time')::time,
  tp.updated_by
from public.technician_profiles tp
cross join lateral jsonb_each(tp.default_working_hours) entry(key,value)
where tp.employee_id is not null
  and key ~ '^[0-6]$'
  and jsonb_typeof(value)='object'
  and coalesce(value->>'start',value->>'start_time') is not null
  and coalesce(value->>'end',value->>'end_time') is not null;

update public.employee_availability_profiles profile
set weekly_schedule_configured=true
where exists(
  select 1 from public.employee_weekly_intervals schedule
  where schedule.business_id=profile.business_id
    and schedule.employee_id=profile.employee_id
);

comment on table public.employee_availability_profiles is
  'Employee scheduling preferences and capacity. Time zone is IANA; maximum hours are persisted as integer minutes.';
comment on table public.employee_weekly_intervals is
  'Recurring business-local wall-clock working and break intervals. weekday 0 is Sunday.';
comment on table public.employee_availability_exceptions is
  'UTC availability overrides for PTO, vacation, holidays, sick time, breaks, and other exceptions.';

commit;
