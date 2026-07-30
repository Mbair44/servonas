-- Flexible recurring scheduling.
-- The cadence date remains the contractual target. For route-optimized plans,
-- Servonas chooses an actual visit date inside the approved window by favoring
-- days where the assigned technician already has nearby work.
begin;

alter table public.recurring_service_series
  add column if not exists scheduling_mode text not null default 'fixed_date',
  add column if not exists scheduling_flex_days smallint not null default 0;

alter table public.recurring_service_series
  drop constraint if exists recurring_service_series_scheduling_mode_check;
alter table public.recurring_service_series
  add constraint recurring_service_series_scheduling_mode_check
  check(scheduling_mode in ('fixed_date','route_optimized'));

alter table public.recurring_service_series
  drop constraint if exists recurring_service_series_scheduling_flex_check;
alter table public.recurring_service_series
  add constraint recurring_service_series_scheduling_flex_check
  check(
    scheduling_flex_days between 0 and 30
    and (scheduling_mode='route_optimized' or scheduling_flex_days=0)
  );

alter table public.service_plan_occurrences
  add column if not exists target_date date;

update public.service_plan_occurrences
set target_date=occurrence_date
where target_date is null;

alter table public.service_plan_occurrences
  alter column target_date set not null;

comment on column public.service_plan_occurrences.target_date is
  'Cadence-derived due date. occurrence_date is the actual scheduled date and may differ only for route-optimized plans.';

create or replace function public.choose_service_plan_route_date(
  p_plan_id uuid,
  p_target_date date
) returns date
language plpgsql
security definer
set search_path=public
as $$
declare
  v_plan public.recurring_service_series%rowtype;
  v_business public.businesses%rowtype;
  v_location public.service_locations%rowtype;
  v_technician_id uuid;
  v_today date;
  v_candidate date;
  v_best_date date;
  v_score numeric;
  v_best_score numeric;
begin
  select * into v_plan
  from public.recurring_service_series
  where id=p_plan_id;
  if not found or v_plan.scheduling_mode<>'route_optimized' then
    return p_target_date;
  end if;

  select * into v_business from public.businesses where id=v_plan.business_id;
  select * into v_location
  from public.service_locations
  where business_id=v_plan.business_id and id=v_plan.service_location_id;

  v_today=(now() at time zone coalesce(v_business.timezone,'UTC'))::date;
  v_technician_id=coalesce(v_plan.default_employee_id,v_location.default_technician_id);

  for v_candidate in
    select day::date
    from generate_series(
      greatest(v_today,p_target_date-v_plan.scheduling_flex_days),
      least(coalesce(v_plan.end_date,p_target_date+v_plan.scheduling_flex_days),p_target_date+v_plan.scheduling_flex_days),
      interval '1 day'
    ) day
  loop
    -- Never collapse two cadence occurrences from the same plan onto one day.
    if exists(
      select 1
      from public.service_plan_occurrences existing
      where existing.business_id=v_plan.business_id
        and existing.service_plan_id=v_plan.id
        and existing.occurrence_type='recurring'
        and existing.occurrence_date=v_candidate
    ) then
      continue;
    end if;

    select
      -- Prefer nearby existing work first, then denser route days, then the
      -- smallest departure from the contractual cadence date.
      coalesce(min(
        power((other.latitude::numeric-v_location.latitude::numeric),2)
        + power((other.longitude::numeric-v_location.longitude::numeric),2)
      )*1000000,50000)
      - count(j.id)*25
      + abs(v_candidate-p_target_date)
      + case when coalesce(sum(coalesce(j.estimated_duration_minutes,60)),0)
                  + v_plan.default_duration_minutes > 480 then 100000 else 0 end
    into v_score
    from public.jobs j
    left join public.service_locations other
      on other.business_id=j.business_id and other.id=j.service_location_id
    where j.business_id=v_plan.business_id
      and j.is_deleted=false
      and j.status not in ('completed','canceled','declined')
      and (j.starts_at at time zone coalesce(v_business.timezone,'UTC'))::date=v_candidate
      and (v_technician_id is null or j.assigned_technician_id=v_technician_id)
      and j.recurring_service_series_id is distinct from v_plan.id;

    if v_best_score is null or v_score<v_best_score then
      v_best_score=v_score;
      v_best_date=v_candidate;
    end if;
  end loop;

  return coalesce(v_best_date,greatest(v_today,p_target_date));
end
$$;

-- Internal scheduling primitive: callers use generate_service_plan_jobs(), which
-- performs the tenant-role authorization check.
revoke all on function public.choose_service_plan_route_date(uuid,date) from public,authenticated;
grant execute on function public.choose_service_plan_route_date(uuid,date) to service_role;

create or replace function public.schedule_flexible_service_plan_occurrence()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  new.target_date=coalesce(new.target_date,new.occurrence_date);
  if new.occurrence_type='recurring' then
    new.occurrence_date=public.choose_service_plan_route_date(
      new.service_plan_id,
      new.target_date
    );
  end if;
  return new;
end
$$;

drop trigger if exists service_plan_occurrence_choose_route_date
  on public.service_plan_occurrences;
create trigger service_plan_occurrence_choose_route_date
before insert on public.service_plan_occurrences
for each row execute function public.schedule_flexible_service_plan_occurrence();

-- Ensure PostgREST exposes the newly added scheduling fields immediately.
notify pgrst, 'reload schema';

commit;
