-- Checkpoint 6 compatibility repair for databases where the routing tables
-- were installed before provider-neutral travel modes were added.

alter table public.route_plans
  add column if not exists travel_mode text;

update public.route_plans
set travel_mode='driving'
where travel_mode is null or length(trim(travel_mode))=0;

alter table public.route_plans
  alter column travel_mode set default 'driving',
  alter column travel_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.route_plans'::regclass
      and conname='route_plans_travel_mode_check'
  ) then
    alter table public.route_plans
      add constraint route_plans_travel_mode_check
      check (length(trim(travel_mode))>0);
  end if;
end
$$;

comment on column public.route_plans.travel_mode is
  'Provider-neutral travel mode. Text is intentionally extensible for future provider modes without a schema migration.';

notify pgrst,'reload schema';
