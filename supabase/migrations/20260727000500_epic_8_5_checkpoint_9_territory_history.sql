begin;

alter table public.territory_audit_events
  drop constraint if exists territory_audit_type_check;
alter table public.territory_audit_events
  add constraint territory_audit_type_check check(event_type in (
    'bootstrap','created','updated','renamed','activated','deactivated','reparented',
    'boundary_created','boundary_updated','split','merged'
  ));

create or replace function public.territory_geometry_part_count(p_geometry jsonb)
returns integer language sql immutable parallel safe as $$
  select case
    when p_geometry is null then 0
    when p_geometry->>'type'='Polygon' then 1
    when p_geometry->>'type'='MultiPolygon'
      and jsonb_typeof(p_geometry->'coordinates')='array'
      then jsonb_array_length(p_geometry->'coordinates')
    else 0
  end
$$;

create or replace function public.capture_workforce_territory_audit()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_event_type text;
declare v_old_parts integer;
declare v_new_parts integer;
begin
  v_old_parts=case when tg_op='INSERT' then 0 else public.territory_geometry_part_count(to_jsonb(old.boundary_geojson)) end;
  v_new_parts=public.territory_geometry_part_count(to_jsonb(new.boundary_geojson));
  v_event_type=case
    when tg_op='INSERT' then 'created'
    when old.is_active and not new.is_active then 'deactivated'
    when not old.is_active and new.is_active then 'activated'
    when old.parent_territory_id is distinct from new.parent_territory_id then 'reparented'
    when old.name is distinct from new.name then 'renamed'
    when old.boundary_geojson is distinct from new.boundary_geojson and v_old_parts=0 and v_new_parts>0 then 'boundary_created'
    when old.boundary_geojson is distinct from new.boundary_geojson and v_new_parts>v_old_parts then 'split'
    when old.boundary_geojson is distinct from new.boundary_geojson and v_new_parts<v_old_parts then 'merged'
    when old.boundary_geojson is distinct from new.boundary_geojson then 'boundary_updated'
    else 'updated' end;
  insert into public.territory_audit_events(
    business_id,territory_id,event_type,territory_version,
    previous_snapshot,snapshot,actor_user_id
  ) values(
    new.business_id,new.id,v_event_type,new.version,
    case when tg_op='INSERT' then null else to_jsonb(old)-array['notes'] end,
    to_jsonb(new)-array['notes'],
    coalesce(new.updated_by,new.created_by,auth.uid())
  );
  return new;
end
$$;
revoke all on function public.territory_geometry_part_count(jsonb) from public;
revoke all on function public.capture_workforce_territory_audit() from public;

create table public.territory_assignment_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  territory_id uuid not null,
  assignment_id uuid not null,
  employee_id uuid not null,
  event_type text not null,
  assignment_type text not null,
  previous_snapshot jsonb,
  snapshot jsonb not null,
  actor_user_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  constraint territory_assignment_audit_business_fk foreign key(business_id)
    references public.businesses(id) on delete restrict,
  constraint territory_assignment_audit_territory_fk foreign key(business_id,territory_id)
    references public.workforce_territories(business_id,id) on delete restrict,
  constraint territory_assignment_audit_event_check check(event_type in ('assigned','coverage_changed','coverage_ended')),
  constraint territory_assignment_audit_snapshot_check check(
    jsonb_typeof(snapshot)='object'
    and (previous_snapshot is null or jsonb_typeof(previous_snapshot)='object')
  )
);
create index territory_assignment_audit_timeline_idx
  on public.territory_assignment_audit_events(business_id,territory_id,occurred_at desc);

alter table public.territory_assignment_audit_events enable row level security;
create policy "office reads territory assignment history"
  on public.territory_assignment_audit_events for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));

create or replace function public.capture_territory_assignment_audit()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_event_type text;
begin
  v_event_type=case
    when tg_op='INSERT' then 'assigned'
    when old.ended_at is null and new.ended_at is not null then 'coverage_ended'
    else 'coverage_changed' end;
  insert into public.territory_assignment_audit_events(
    business_id,territory_id,assignment_id,employee_id,event_type,assignment_type,
    previous_snapshot,snapshot,actor_user_id
  ) values(
    new.business_id,new.territory_id,new.id,new.employee_id,v_event_type,new.assignment_type,
    case when tg_op='INSERT' then null else to_jsonb(old)-array['notes'] end,
    to_jsonb(new)-array['notes'],
    coalesce(new.ended_by,new.created_by,auth.uid())
  );
  return new;
end
$$;
create trigger employee_territories_capture_history
after insert or update on public.employee_territory_assignments
for each row execute function public.capture_territory_assignment_audit();

create trigger territory_assignment_audit_immutable
before update or delete on public.territory_assignment_audit_events
for each row execute function public.guard_territory_audit_immutability();

insert into public.territory_assignment_audit_events(
  business_id,territory_id,assignment_id,employee_id,event_type,assignment_type,
  snapshot,actor_user_id,occurred_at
)
select assignment.business_id,assignment.territory_id,assignment.id,assignment.employee_id,
  case when assignment.ended_at is null then 'assigned' else 'coverage_ended' end,
  assignment.assignment_type,to_jsonb(assignment)-array['notes'],
  coalesce(assignment.ended_by,assignment.created_by),coalesce(assignment.ended_at,assignment.created_at)
from public.employee_territory_assignments assignment;

revoke all on function public.capture_territory_assignment_audit() from public;

comment on table public.territory_assignment_audit_events is
  'Immutable employee coverage history. Employee and assignment identifiers are snapshots, not cascading foreign keys, so history survives workforce lifecycle changes.';

commit;
