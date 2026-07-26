begin;

alter table public.workforce_territories
  add column color text not null default '#4F46E5',
  add column notes text,
  add column parent_territory_id uuid,
  add column version integer not null default 1,
  add column strategy_config jsonb not null default '{}';

alter table public.workforce_territories
  add constraint workforce_territories_parent_fk
    foreign key(business_id,parent_territory_id)
    references public.workforce_territories(business_id,id) on delete restrict,
  add constraint workforce_territories_parent_self_check
    check(parent_territory_id is null or parent_territory_id<>id),
  add constraint workforce_territories_color_check
    check(color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint workforce_territories_notes_check
    check(notes is null or length(notes)<=4000),
  add constraint workforce_territories_version_check
    check(version>0),
  add constraint workforce_territories_strategy_config_check
    check(jsonb_typeof(strategy_config)='object');

create index workforce_territories_parent_idx
  on public.workforce_territories(business_id,parent_territory_id)
  where parent_territory_id is not null;

create or replace function public.validate_workforce_territory_hierarchy()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.parent_territory_id is null then return new; end if;
  if new.parent_territory_id=new.id then
    raise exception 'A territory cannot be its own parent' using errcode='23514';
  end if;
  if exists(
    with recursive descendants as (
      select territory.id,territory.parent_territory_id
      from public.workforce_territories territory
      where territory.business_id=new.business_id and territory.id=new.parent_territory_id
      union all
      select territory.id,territory.parent_territory_id
      from public.workforce_territories territory
      join descendants child on territory.id=child.parent_territory_id
      where territory.business_id=new.business_id
    )
    select 1 from descendants where id=new.id
  ) then
    raise exception 'Territory hierarchy cannot contain a cycle' using errcode='23514';
  end if;
  return new;
end $$;
create trigger workforce_territories_validate_hierarchy
before insert or update of parent_territory_id,business_id
on public.workforce_territories
for each row execute function public.validate_workforce_territory_hierarchy();

create or replace function public.increment_workforce_territory_version()
returns trigger language plpgsql as $$
begin
  new.version=old.version+1;
  return new;
end $$;
create trigger workforce_territories_increment_version
before update on public.workforce_territories
for each row execute function public.increment_workforce_territory_version();

create table public.territory_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  territory_id uuid not null,
  event_type text not null,
  territory_version integer not null,
  previous_snapshot jsonb,
  snapshot jsonb not null,
  actor_user_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  constraint territory_audit_business_fk foreign key(business_id)
    references public.businesses(id) on delete restrict,
  constraint territory_audit_territory_fk foreign key(business_id,territory_id)
    references public.workforce_territories(business_id,id) on delete restrict,
  constraint territory_audit_type_check check(event_type in (
    'bootstrap','created','updated','renamed','activated','deactivated','reparented'
  )),
  constraint territory_audit_version_check check(territory_version>0),
  constraint territory_audit_previous_check check(
    previous_snapshot is null or jsonb_typeof(previous_snapshot)='object'
  ),
  constraint territory_audit_snapshot_check check(jsonb_typeof(snapshot)='object')
);
create unique index territory_audit_version_unique
  on public.territory_audit_events(business_id,territory_id,territory_version);
create index territory_audit_timeline_idx
  on public.territory_audit_events(business_id,territory_id,occurred_at desc);

alter table public.territory_audit_events enable row level security;
create policy "office reads territory audit history" on public.territory_audit_events
  for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));

create or replace function public.capture_workforce_territory_audit()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_event_type text;
begin
  v_event_type=case
    when tg_op='INSERT' then 'created'
    when old.is_active and not new.is_active then 'deactivated'
    when not old.is_active and new.is_active then 'activated'
    when old.parent_territory_id is distinct from new.parent_territory_id then 'reparented'
    when old.name is distinct from new.name then 'renamed'
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
end $$;
create trigger workforce_territories_capture_audit
after insert or update on public.workforce_territories
for each row execute function public.capture_workforce_territory_audit();

create or replace function public.guard_territory_audit_immutability()
returns trigger language plpgsql as $$
begin
  if current_setting('servonas.history_maintenance',true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Territory audit history is immutable' using errcode='23514';
end $$;
create trigger territory_audit_immutable
before update or delete on public.territory_audit_events
for each row execute function public.guard_territory_audit_immutability();

insert into public.territory_audit_events(
  business_id,territory_id,event_type,territory_version,snapshot,actor_user_id
)
select territory.business_id,territory.id,'bootstrap',territory.version,
  to_jsonb(territory)-array['notes'],territory.updated_by
from public.workforce_territories territory;

revoke all on function public.validate_workforce_territory_hierarchy() from public;
revoke all on function public.increment_workforce_territory_version() from public;
revoke all on function public.capture_workforce_territory_audit() from public;
revoke all on function public.guard_territory_audit_immutability() from public;

comment on column public.workforce_territories.parent_territory_id is
  'Optional tenant-scoped hierarchy for regions, branches, delivery zones, and nested service areas.';
comment on column public.workforce_territories.strategy_config is
  'Provider-neutral future strategy configuration. Business logic must validate supported keys before using them.';
comment on table public.territory_audit_events is
  'Immutable versioned territory history. Free-text notes are excluded from snapshots to limit unnecessary sensitive data retention.';

commit;
