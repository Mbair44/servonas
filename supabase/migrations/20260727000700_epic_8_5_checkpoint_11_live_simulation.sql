begin;

alter table public.territory_scenarios
  add column simulation_status text not null default 'ready',
  add column simulation_revision integer not null default 0,
  add column last_simulated_at timestamptz,
  add constraint territory_scenarios_simulation_status_check
    check(simulation_status in ('ready','stale','calculating','failed')),
  add constraint territory_scenarios_simulation_revision_check check(simulation_revision>=0);

create or replace function public.touch_territory_scenario_simulation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_business_id uuid;
declare v_scenario_id uuid;
begin
  if tg_op='DELETE' then
    v_business_id=old.business_id;v_scenario_id=old.scenario_id;
  else
    v_business_id=new.business_id;v_scenario_id=new.scenario_id;
  end if;
  update public.territory_scenarios
  set simulation_status='stale',simulation_revision=simulation_revision+1,
    version=version+1,updated_at=now(),updated_by=auth.uid()
  where business_id=v_business_id and id=v_scenario_id and deleted_at is null;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;
create trigger scenario_territories_stale_simulation
after insert or update or delete on public.territory_scenario_territories
for each row execute function public.touch_territory_scenario_simulation();
revoke all on function public.touch_territory_scenario_simulation() from public;

comment on column public.territory_scenarios.simulation_revision is
  'Monotonic scenario-input revision for incremental recalculation and future optimistic worker coordination.';

commit;
