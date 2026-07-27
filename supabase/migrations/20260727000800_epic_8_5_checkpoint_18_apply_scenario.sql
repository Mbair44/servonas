begin;
alter table public.territory_scenarios drop constraint territory_scenarios_status_check;
alter table public.territory_scenarios add column approved_at timestamptz,add column approved_by uuid references auth.users(id),add column applied_at timestamptz,add column applied_by uuid references auth.users(id),
 add constraint territory_scenarios_status_check check(status in ('draft','approved','applied','archived')),
 add constraint territory_scenarios_approval_check check(status not in ('approved','applied') or approved_at is not null),
 add constraint territory_scenarios_apply_check check(status<>'applied' or applied_at is not null);
create table public.territory_scenario_apply_events(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,scenario_id uuid not null,
 event_type text not null check(event_type in ('approved','applied')),actor_user_id uuid not null references auth.users(id),scenario_version integer not null,
 simulation_revision integer not null,territory_count integer not null,metadata jsonb not null default '{}',occurred_at timestamptz not null default now(),
 foreign key(business_id,scenario_id) references public.territory_scenarios(business_id,id));
alter table public.territory_scenario_apply_events enable row level security;
create policy "office reads scenario apply history" on public.territory_scenario_apply_events for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create or replace function public.prevent_scenario_apply_event_mutation() returns trigger language plpgsql as $$begin raise exception 'Scenario apply history is immutable';end$$;
create trigger scenario_apply_events_immutable before update or delete on public.territory_scenario_apply_events for each row execute function public.prevent_scenario_apply_event_mutation();
create or replace function public.approve_territory_scenario(p_business_id uuid,p_scenario_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v public.territory_scenarios%rowtype;v_count integer;begin
 if not public.has_business_role(p_business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 select * into v from public.territory_scenarios where business_id=p_business_id and id=p_scenario_id and deleted_at is null for update;
 if not found or v.status<>'draft' then raise exception 'Only a draft scenario can be approved' using errcode='22023';end if;
 select count(*) into v_count from public.territory_scenario_territories where business_id=p_business_id and scenario_id=p_scenario_id and change_type<>'removed';
 update public.territory_scenarios set status='approved',approved_at=now(),approved_by=auth.uid(),updated_at=now(),updated_by=auth.uid(),version=version+1 where id=v.id;
 insert into public.territory_scenario_apply_events(business_id,scenario_id,event_type,actor_user_id,scenario_version,simulation_revision,territory_count) values(p_business_id,p_scenario_id,'approved',auth.uid(),v.version+1,v.simulation_revision,v_count);
end$$;
create or replace function public.apply_territory_scenario(p_business_id uuid,p_scenario_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v public.territory_scenarios%rowtype;v_count integer;begin
 if not public.has_business_role(p_business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 select * into v from public.territory_scenarios where business_id=p_business_id and id=p_scenario_id and deleted_at is null for update;
 if not found or v.status<>'approved' then raise exception 'The scenario must be approved before it can be applied' using errcode='22023';end if;
 update public.workforce_territories live set name=s.name,description=s.description,color=s.color,territory_type=s.territory_type,postal_codes=s.postal_codes,neighborhoods=s.neighborhoods,boundary_geojson=s.boundary_geojson,strategy_config=s.strategy_config,is_active=s.change_type<>'removed',updated_at=now(),updated_by=auth.uid(),version=live.version+1 from public.territory_scenario_territories s where s.business_id=p_business_id and s.scenario_id=p_scenario_id and s.source_territory_id=live.id and live.business_id=p_business_id;
 insert into public.workforce_territories(business_id,name,description,color,territory_type,postal_codes,neighborhoods,boundary_geojson,strategy_config,is_active,created_by,updated_by) select p_business_id,name,description,color,territory_type,postal_codes,neighborhoods,boundary_geojson,strategy_config,true,auth.uid(),auth.uid() from public.territory_scenario_territories where business_id=p_business_id and scenario_id=p_scenario_id and source_territory_id is null and change_type='created';
 select count(*) into v_count from public.territory_scenario_territories where business_id=p_business_id and scenario_id=p_scenario_id;
 update public.territory_scenarios set status='applied',applied_at=now(),applied_by=auth.uid(),updated_at=now(),updated_by=auth.uid(),version=version+1 where id=v.id;
 insert into public.territory_scenario_apply_events(business_id,scenario_id,event_type,actor_user_id,scenario_version,simulation_revision,territory_count,metadata) values(p_business_id,p_scenario_id,'applied',auth.uid(),v.version+1,v.simulation_revision,v_count,jsonb_build_object('atomic',true));
end$$;
revoke all on function public.approve_territory_scenario(uuid,uuid) from public;revoke all on function public.apply_territory_scenario(uuid,uuid) from public;
grant execute on function public.approve_territory_scenario(uuid,uuid) to authenticated;grant execute on function public.apply_territory_scenario(uuid,uuid) to authenticated;
commit;
