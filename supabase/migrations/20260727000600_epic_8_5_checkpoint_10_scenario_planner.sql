begin;

create table public.territory_scenarios (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft',
  version integer not null default 1,
  source_scenario_id uuid,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  constraint territory_scenarios_tenant_unique unique(business_id,id),
  constraint territory_scenarios_name_check check(length(btrim(name)) between 1 and 150),
  constraint territory_scenarios_description_check check(description is null or length(description)<=2000),
  constraint territory_scenarios_status_check check(status in ('draft','archived')),
  constraint territory_scenarios_version_check check(version>0),
  constraint territory_scenarios_source_fk foreign key(business_id,source_scenario_id)
    references public.territory_scenarios(business_id,id) on delete set null
);
create unique index territory_scenarios_active_name_unique
  on public.territory_scenarios(business_id,lower(name)) where deleted_at is null;
create index territory_scenarios_workspace_idx
  on public.territory_scenarios(business_id,status,updated_at desc) where deleted_at is null;

create table public.territory_scenario_territories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  scenario_id uuid not null,
  source_territory_id uuid,
  name text not null,
  description text,
  color text not null,
  territory_type text not null,
  postal_codes text[] not null default '{}',
  neighborhoods text[] not null default '{}',
  boundary_geojson jsonb,
  strategy_config jsonb not null default '{}',
  parent_source_territory_id uuid,
  change_type text not null default 'unchanged',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenario_territories_scenario_fk foreign key(business_id,scenario_id)
    references public.territory_scenarios(business_id,id) on delete cascade,
  constraint scenario_territories_source_fk foreign key(business_id,source_territory_id)
    references public.workforce_territories(business_id,id) on delete set null,
  constraint scenario_territories_name_check check(length(btrim(name)) between 1 and 150),
  constraint scenario_territories_color_check check(color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint scenario_territories_change_check check(change_type in ('unchanged','created','modified','removed')),
  constraint scenario_territories_geometry_check check(boundary_geojson is null or jsonb_typeof(boundary_geojson)='object'),
  constraint scenario_territories_strategy_check check(jsonb_typeof(strategy_config)='object'),
  constraint scenario_territories_version_check check(version>0)
);
create unique index scenario_territories_source_unique
  on public.territory_scenario_territories(business_id,scenario_id,source_territory_id)
  where source_territory_id is not null;
create index scenario_territories_workspace_idx
  on public.territory_scenario_territories(business_id,scenario_id,change_type);

alter table public.territory_scenarios enable row level security;
alter table public.territory_scenario_territories enable row level security;
create policy "office reads territory scenarios" on public.territory_scenarios
  for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners manage territory scenarios" on public.territory_scenarios
  for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "office reads scenario territories" on public.territory_scenario_territories
  for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners manage scenario territories" on public.territory_scenario_territories
  for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));

create or replace function public.create_territory_scenario(
  p_business_id uuid,p_name text,p_description text default null
) returns uuid language plpgsql security invoker set search_path=public as $$
declare v_scenario_id uuid;
begin
  if not public.has_business_role(p_business_id,array['owner','admin']) then
    raise exception 'Scenario permission denied' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_name,''))) not between 1 and 150 then
    raise exception 'Invalid scenario name' using errcode='22023';
  end if;
  insert into public.territory_scenarios(business_id,name,description,created_by,updated_by)
  values(p_business_id,btrim(p_name),nullif(btrim(p_description),''),auth.uid(),auth.uid())
  returning id into v_scenario_id;
  insert into public.territory_scenario_territories(
    business_id,scenario_id,source_territory_id,name,description,color,territory_type,
    postal_codes,neighborhoods,boundary_geojson,strategy_config,parent_source_territory_id
  )
  select territory.business_id,v_scenario_id,territory.id,territory.name,territory.description,
    territory.color,territory.territory_type,territory.postal_codes,territory.neighborhoods,
    territory.boundary_geojson,territory.strategy_config,territory.parent_territory_id
  from public.workforce_territories territory
  where territory.business_id=p_business_id and territory.is_active;
  return v_scenario_id;
end
$$;

create or replace function public.duplicate_territory_scenario(
  p_business_id uuid,p_scenario_id uuid,p_name text
) returns uuid language plpgsql security invoker set search_path=public as $$
declare v_new_id uuid;
begin
  if not public.has_business_role(p_business_id,array['owner','admin']) then
    raise exception 'Scenario permission denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.territory_scenarios where business_id=p_business_id and id=p_scenario_id and deleted_at is null) then
    raise exception 'Scenario unavailable' using errcode='23503';
  end if;
  insert into public.territory_scenarios(business_id,name,description,source_scenario_id,created_by,updated_by)
  select business_id,btrim(p_name),description,id,auth.uid(),auth.uid()
  from public.territory_scenarios where business_id=p_business_id and id=p_scenario_id
  returning id into v_new_id;
  insert into public.territory_scenario_territories(
    business_id,scenario_id,source_territory_id,name,description,color,territory_type,
    postal_codes,neighborhoods,boundary_geojson,strategy_config,parent_source_territory_id,change_type
  )
  select business_id,v_new_id,source_territory_id,name,description,color,territory_type,
    postal_codes,neighborhoods,boundary_geojson,strategy_config,parent_source_territory_id,change_type
  from public.territory_scenario_territories
  where business_id=p_business_id and scenario_id=p_scenario_id;
  return v_new_id;
end
$$;

revoke all on function public.create_territory_scenario(uuid,text,text) from public;
revoke all on function public.duplicate_territory_scenario(uuid,uuid,text) from public;
grant execute on function public.create_territory_scenario(uuid,text,text) to authenticated;
grant execute on function public.duplicate_territory_scenario(uuid,uuid,text) to authenticated;

comment on table public.territory_scenarios is
  'Isolated territory planning workspaces. Scenario records never change live territories until the explicit future apply workflow.';
comment on table public.territory_scenario_territories is
  'Scenario-owned territory snapshots. source_territory_id provides comparison lineage without making scenario edits live.';

commit;
