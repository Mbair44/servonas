-- Compatibility repair: some Epic 7 installations predate the
-- route_plans.calculation_revision column while their audit trigger references it.
begin;

alter table public.route_plans
  add column if not exists calculation_revision bigint;

update public.route_plans
set calculation_revision=0
where calculation_revision is null;

alter table public.route_plans
  alter column calculation_revision set default 0,
  alter column calculation_revision set not null;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.route_plans'::regclass
      and conname='route_plans_calculation_revision_check'
  ) then
    alter table public.route_plans
      add constraint route_plans_calculation_revision_check
      check(calculation_revision>=0);
  end if;
end $$;

create or replace function public.enforce_route_plan_calculation_revision()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.calculation_status in ('queued','calculating')
    and old.calculation_status not in ('queued','calculating') then
    new.calculation_revision=old.calculation_revision+1;
    if new.version<=old.version then new.version=old.version+1; end if;
  elsif new.calculation_revision<>old.calculation_revision then
    raise exception 'Calculation revision can only change when a new calculation starts'
      using errcode='check_violation';
  end if;
  return new;
end $$;

drop trigger if exists route_plans_calculation_revision on public.route_plans;
create trigger route_plans_calculation_revision
before update on public.route_plans
for each row execute function public.enforce_route_plan_calculation_revision();

-- Recover plans left in calculating after their technician routes completed.
with recovered as (
  select
    route.route_plan_id,
    case
      when bool_or(route.calculation_status='failed')
        then case when bool_or(route.calculation_status in ('ready','partial')) then 'partial' else 'failed' end
      when bool_or(route.calculation_status='partial') then 'partial'
      else 'ready'
    end as recovered_status,
    coalesce(sum(route.driving_distance_meters)
      filter(where route.calculation_status in ('ready','partial')),0)::integer as distance_meters,
    coalesce(sum(route.driving_duration_seconds)
      filter(where route.calculation_status in ('ready','partial')),0)::integer as duration_seconds
  from public.technician_routes route
  join public.route_plans plan
    on plan.business_id=route.business_id and plan.id=route.route_plan_id
  where plan.calculation_status='calculating'
  group by route.route_plan_id
  having not bool_or(route.calculation_status in ('queued','calculating'))
)
update public.route_plans plan
set calculation_status=recovered.recovered_status,
    total_driving_distance_meters=recovered.distance_meters,
    total_driving_duration_seconds=recovered.duration_seconds,
    calculated_at=coalesce(plan.calculated_at,now()),
    error_code=case when recovered.recovered_status='failed' then 'recovered_failed_routes' else null end,
    stale_at=null
from recovered
where plan.id=recovered.route_plan_id;

notify pgrst,'reload schema';
commit;
