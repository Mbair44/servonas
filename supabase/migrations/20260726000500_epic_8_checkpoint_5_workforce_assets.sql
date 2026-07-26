begin;

create table public.workforce_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  asset_type text not null,
  name text not null,
  asset_number text,
  serial_number text,
  manufacturer text,
  model text,
  model_year smallint,
  license_plate text,
  vin text,
  status text not null default 'available',
  condition text not null default 'good',
  notes text,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workforce_assets_business_fk foreign key(business_id)
    references public.businesses(id) on delete cascade,
  constraint workforce_assets_tenant_unique unique(business_id,id),
  constraint workforce_assets_type_check check(asset_type in (
    'vehicle','trailer','equipment','tablet','key','safety_equipment','other'
  )),
  constraint workforce_assets_status_check check(status in (
    'available','assigned','maintenance','retired','lost'
  )),
  constraint workforce_assets_condition_check check(condition in (
    'new','good','fair','poor','out_of_service'
  )),
  constraint workforce_assets_name_check check(length(btrim(name)) between 1 and 150),
  constraint workforce_assets_year_check check(model_year is null or model_year between 1900 and 2200),
  constraint workforce_assets_notes_check check(notes is null or length(notes)<=2000),
  constraint workforce_assets_metadata_check check(jsonb_typeof(metadata)='object')
);

create unique index workforce_assets_number_unique
  on public.workforce_assets(business_id,lower(asset_number))
  where asset_number is not null;
create unique index workforce_assets_serial_unique
  on public.workforce_assets(business_id,lower(serial_number))
  where serial_number is not null;
create index workforce_assets_directory_idx
  on public.workforce_assets(business_id,status,asset_type,name);

create table public.employee_asset_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  employee_id uuid not null,
  asset_id uuid not null,
  assigned_at timestamptz not null default now(),
  expected_return_at timestamptz,
  returned_at timestamptz,
  assignment_condition text,
  return_condition text,
  assignment_notes text,
  return_notes text,
  assigned_by uuid references auth.users(id),
  returned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint employee_assets_employee_fk foreign key(business_id,employee_id)
    references public.employees(business_id,id) on delete cascade,
  constraint employee_assets_asset_fk foreign key(business_id,asset_id)
    references public.workforce_assets(business_id,id) on delete restrict,
  constraint employee_assets_dates_check check(expected_return_at is null or expected_return_at>=assigned_at),
  constraint employee_assets_return_check check(returned_at is null or returned_at>=assigned_at),
  constraint employee_assets_assignment_condition_check check(
    assignment_condition is null or assignment_condition in ('new','good','fair','poor','out_of_service')
  ),
  constraint employee_assets_return_condition_check check(
    return_condition is null or return_condition in ('new','good','fair','poor','out_of_service')
  ),
  constraint employee_assets_assignment_notes_check check(assignment_notes is null or length(assignment_notes)<=2000),
  constraint employee_assets_return_notes_check check(return_notes is null or length(return_notes)<=2000)
);

create unique index employee_assets_one_active_holder
  on public.employee_asset_assignments(business_id,asset_id)
  where returned_at is null;
create index employee_assets_employee_history_idx
  on public.employee_asset_assignments(business_id,employee_id,assigned_at desc);
create index employee_assets_expected_return_idx
  on public.employee_asset_assignments(business_id,expected_return_at)
  where returned_at is null and expected_return_at is not null;

alter table public.workforce_assets enable row level security;
alter table public.employee_asset_assignments enable row level security;

create policy "office reads workforce assets" on public.workforce_assets
  for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer workforce assets" on public.workforce_assets
  for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "employees read assigned asset details" on public.workforce_assets
  for select to authenticated using(exists(
    select 1
    from public.employee_asset_assignments assignment
    join public.employees employee
      on employee.business_id=assignment.business_id and employee.id=assignment.employee_id
    where assignment.business_id=workforce_assets.business_id
      and assignment.asset_id=workforce_assets.id
      and assignment.returned_at is null
      and employee.auth_user_id=auth.uid()
  ));

create policy "office reads employee asset history" on public.employee_asset_assignments
  for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "employees read own asset assignments" on public.employee_asset_assignments
  for select to authenticated using(exists(
    select 1 from public.employees employee
    where employee.business_id=employee_asset_assignments.business_id
      and employee.id=employee_asset_assignments.employee_id
      and employee.auth_user_id=auth.uid()
  ));

create trigger workforce_assets_updated_at before update on public.workforce_assets
for each row execute function public.set_routing_updated_at();

create or replace function public.assign_workforce_asset(
  p_business_id uuid,
  p_employee_id uuid,
  p_asset_id uuid,
  p_expected_return_at timestamptz default null,
  p_assignment_notes text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_assignment_id uuid; v_condition text;
begin
  if not public.has_business_role(p_business_id,array['owner','admin']) then
    raise exception 'Not authorized to assign workforce assets' using errcode='42501';
  end if;
  select condition into v_condition from public.workforce_assets
  where business_id=p_business_id and id=p_asset_id and status='available'
  for update;
  if not found then raise exception 'Asset is not available' using errcode='P0001'; end if;
  if not exists(select 1 from public.employees where business_id=p_business_id and id=p_employee_id and is_active) then
    raise exception 'Employee is not active' using errcode='P0001';
  end if;
  insert into public.employee_asset_assignments(
    business_id,employee_id,asset_id,expected_return_at,assignment_condition,
    assignment_notes,assigned_by
  ) values(
    p_business_id,p_employee_id,p_asset_id,p_expected_return_at,v_condition,
    nullif(btrim(p_assignment_notes),''),auth.uid()
  ) returning id into v_assignment_id;
  update public.workforce_assets set status='assigned',updated_by=auth.uid()
  where business_id=p_business_id and id=p_asset_id;
  return v_assignment_id;
end $$;

create or replace function public.return_workforce_asset(
  p_business_id uuid,
  p_assignment_id uuid,
  p_return_condition text,
  p_return_notes text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_asset_id uuid;
begin
  if not public.has_business_role(p_business_id,array['owner','admin']) then
    raise exception 'Not authorized to return workforce assets' using errcode='42501';
  end if;
  if p_return_condition not in ('new','good','fair','poor','out_of_service') then
    raise exception 'Invalid return condition' using errcode='22023';
  end if;
  update public.employee_asset_assignments set
    returned_at=now(),returned_by=auth.uid(),return_condition=p_return_condition,
    return_notes=nullif(btrim(p_return_notes),'')
  where business_id=p_business_id and id=p_assignment_id and returned_at is null
  returning asset_id into v_asset_id;
  if v_asset_id is null then raise exception 'Active assignment not found' using errcode='P0001'; end if;
  update public.workforce_assets set
    status=case when p_return_condition='out_of_service' then 'maintenance' else 'available' end,
    condition=p_return_condition,updated_by=auth.uid()
  where business_id=p_business_id and id=v_asset_id;
end $$;

revoke all on function public.assign_workforce_asset(uuid,uuid,uuid,timestamptz,text) from public;
grant execute on function public.assign_workforce_asset(uuid,uuid,uuid,timestamptz,text) to authenticated;
revoke all on function public.return_workforce_asset(uuid,uuid,text,text) from public;
grant execute on function public.return_workforce_asset(uuid,uuid,text,text) to authenticated;

comment on table public.workforce_assets is
  'Operational vehicles, trailers, equipment, devices, keys, and safety assets. This is intentionally separate from customer-facing rental inventory_items.';
comment on table public.employee_asset_assignments is
  'Immutable workforce asset custody history. Active custody has returned_at null; returns close rather than overwrite assignments.';

commit;
