begin;

create table public.workforce_history_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  employee_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  effective_at timestamptz not null default now(),
  previous_snapshot jsonb,
  snapshot jsonb,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint workforce_history_business_fk foreign key(business_id)
    references public.businesses(id) on delete restrict,
  constraint workforce_history_employee_fk foreign key(business_id,employee_id)
    references public.employees(business_id,id) on delete restrict,
  constraint workforce_history_entity_check check(entity_type in (
    'employee','role_assignment','availability','availability_exception',
    'qualification','territory_assignment','asset_assignment','scheduling_preference'
  )),
  constraint workforce_history_event_check check(event_type in (
    'bootstrap','created','changed','ended','deleted'
  )),
  constraint workforce_history_snapshot_check check(
    (previous_snapshot is null or jsonb_typeof(previous_snapshot)='object')
    and (snapshot is null or jsonb_typeof(snapshot)='object')
    and (previous_snapshot is not null or snapshot is not null)
  )
);
create index workforce_history_employee_timeline
  on public.workforce_history_events(business_id,employee_id,effective_at desc);
create index workforce_history_entity_timeline
  on public.workforce_history_events(business_id,entity_type,entity_id,effective_at desc);

alter table public.workforce_history_events enable row level security;
create policy "office reads workforce history" on public.workforce_history_events
  for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "employees read own workforce history" on public.workforce_history_events
  for select to authenticated using(exists(
    select 1 from public.employees employee
    where employee.business_id=workforce_history_events.business_id
      and employee.id=workforce_history_events.employee_id
      and employee.auth_user_id=auth.uid()
  ));

create or replace function public.capture_workforce_history_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_old jsonb=case when tg_op='INSERT' then null else to_jsonb(old) end;
  v_new jsonb=case when tg_op='DELETE' then null else to_jsonb(new) end;
  v_source jsonb=coalesce(v_new,v_old);
  v_business_id uuid=(v_source->>'business_id')::uuid;
  v_employee_id uuid;
  v_entity_id uuid=(v_source->>'id')::uuid;
  v_entity_type text;
  v_event_type text;
  v_reference_snapshot jsonb='{}'::jsonb;
  v_private_keys text[]=array[
    'auth_user_id','email','phone','legal_name','notes','reason',
    'assignment_notes','return_notes','credential_number'
  ];
begin
  v_entity_type=case tg_table_name
    when 'employees' then 'employee'
    when 'employee_role_assignments' then 'role_assignment'
    when 'employee_availability_profiles' then 'availability'
    when 'employee_availability_exceptions' then 'availability_exception'
    when 'employee_qualifications' then 'qualification'
    when 'employee_territory_assignments' then 'territory_assignment'
    when 'employee_asset_assignments' then 'asset_assignment'
    when 'employee_scheduling_preferences' then 'scheduling_preference'
  end;
  v_employee_id=case when tg_table_name='employees'
    then (v_source->>'id')::uuid else (v_source->>'employee_id')::uuid end;
  if tg_table_name in ('employee_availability_profiles','employee_scheduling_preferences') then
    v_entity_id=v_employee_id;
  end if;
  if tg_table_name='employee_qualifications' then
    select jsonb_build_object(
      'qualification_name_snapshot',definition.name,
      'qualification_type_snapshot',definition.qualification_type
    ) into v_reference_snapshot
    from public.workforce_qualifications definition
    where definition.business_id=v_business_id
      and definition.id=(v_source->>'qualification_id')::uuid;
  elsif tg_table_name='employee_territory_assignments' then
    select jsonb_build_object(
      'territory_name_snapshot',territory.name,
      'territory_type_snapshot',territory.territory_type,
      'postal_codes_snapshot',territory.postal_codes,
      'neighborhoods_snapshot',territory.neighborhoods
    ) into v_reference_snapshot
    from public.workforce_territories territory
    where territory.business_id=v_business_id
      and territory.id=(v_source->>'territory_id')::uuid;
  elsif tg_table_name='employee_role_assignments' then
    select jsonb_build_object('role_name_snapshot',role.name)
      into v_reference_snapshot
    from public.workforce_roles role
    where role.business_id=v_business_id
      and role.id=(v_source->>'workforce_role_id')::uuid;
  elsif tg_table_name='employee_asset_assignments' then
    select jsonb_build_object(
      'asset_name_snapshot',asset.name,'asset_type_snapshot',asset.asset_type,
      'asset_number_snapshot',asset.asset_number
    ) into v_reference_snapshot
    from public.workforce_assets asset
    where asset.business_id=v_business_id and asset.id=(v_source->>'asset_id')::uuid;
  end if;
  v_reference_snapshot=coalesce(v_reference_snapshot,'{}'::jsonb);
  v_event_type=case
    when tg_op='INSERT' then 'created'
    when tg_op='DELETE' then 'deleted'
    when coalesce(v_new->>'ended_at',v_new->>'ended_on') is not null
      and coalesce(v_old->>'ended_at',v_old->>'ended_on') is null then 'ended'
    when v_new->>'is_active'='false' and coalesce(v_old->>'is_active','true')='true' then 'ended'
    else 'changed' end;
  insert into public.workforce_history_events(
    business_id,employee_id,entity_type,entity_id,event_type,
    previous_snapshot,snapshot,actor_user_id
  ) values(
    v_business_id,v_employee_id,v_entity_type,v_entity_id,v_event_type,
    case when v_old is null then null else (v_old-v_private_keys)||v_reference_snapshot end,
    case when v_new is null then null else (v_new-v_private_keys)||v_reference_snapshot end,
    auth.uid()
  );
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.capture_workforce_history_event() from public;

create trigger employees_history after insert or update on public.employees
for each row execute function public.capture_workforce_history_event();
create trigger employee_roles_history after insert or update or delete on public.employee_role_assignments
for each row execute function public.capture_workforce_history_event();
create trigger employee_availability_history after insert or update on public.employee_availability_profiles
for each row execute function public.capture_workforce_history_event();
create trigger employee_exceptions_history after insert or update or delete on public.employee_availability_exceptions
for each row execute function public.capture_workforce_history_event();
create trigger employee_qualifications_history after insert or update or delete on public.employee_qualifications
for each row execute function public.capture_workforce_history_event();
create trigger employee_territories_history after insert or update or delete on public.employee_territory_assignments
for each row execute function public.capture_workforce_history_event();
create trigger employee_assets_history after insert or update or delete on public.employee_asset_assignments
for each row execute function public.capture_workforce_history_event();
create trigger employee_preferences_history after insert or update or delete on public.employee_scheduling_preferences
for each row execute function public.capture_workforce_history_event();

create or replace function public.guard_workforce_history_immutability()
returns trigger language plpgsql as $$
begin
  if current_setting('servonas.history_maintenance',true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Workforce history is immutable' using errcode='23514';
end $$;
create trigger workforce_history_immutable
before update or delete on public.workforce_history_events
for each row execute function public.guard_workforce_history_immutability();
revoke all on function public.guard_workforce_history_immutability() from public;

-- Bootstrap privacy-limited current-state facts. These are labeled bootstrap,
-- not presented as proof of state before this migration.
insert into public.workforce_history_events(
  business_id,employee_id,entity_type,entity_id,event_type,effective_at,snapshot
)
select business_id,id,'employee',id,'bootstrap',now(),
  jsonb_build_object(
    'id',id,'business_id',business_id,'preferred_name',preferred_name,
    'employee_number',employee_number,'hire_date',hire_date,
    'termination_date',termination_date,'is_active',is_active,
    'created_at',created_at,'updated_at',updated_at
  )
from public.employees;

insert into public.workforce_history_events(
  business_id,employee_id,entity_type,entity_id,event_type,effective_at,snapshot
)
select business_id,employee_id,'qualification',id,'bootstrap',now(),
  (to_jsonb(assignment)-array['credential_number','notes'])
    ||jsonb_build_object(
      'qualification_name_snapshot',definition.name,
      'qualification_type_snapshot',definition.qualification_type
    )
from public.employee_qualifications assignment
join public.workforce_qualifications definition
  on definition.business_id=assignment.business_id and definition.id=assignment.qualification_id;

insert into public.workforce_history_events(
  business_id,employee_id,entity_type,entity_id,event_type,effective_at,snapshot
)
select business_id,employee_id,'territory_assignment',id,'bootstrap',now(),
  (to_jsonb(assignment)-array['notes'])
    ||jsonb_build_object(
      'territory_name_snapshot',territory.name,
      'territory_type_snapshot',territory.territory_type,
      'postal_codes_snapshot',territory.postal_codes,
      'neighborhoods_snapshot',territory.neighborhoods
    )
from public.employee_territory_assignments assignment
join public.workforce_territories territory
  on territory.business_id=assignment.business_id and territory.id=assignment.territory_id;

comment on table public.workforce_history_events is
  'Append-only, privacy-limited workforce state history. Bootstrap rows describe migration-time state only; later rows preserve before/after facts.';
comment on column public.workforce_history_events.snapshot is
  'Operational snapshot with direct contact, legal identity, credential numbers, and free-text notes intentionally excluded.';

commit;
