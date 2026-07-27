begin;

alter table public.employee_territory_assignments
  drop constraint employee_territories_type_check;
alter table public.employee_territory_assignments
  add constraint employee_territories_type_check
  check(assignment_type in ('primary','backup','secondary','temporary'));

-- The operating invariant is territory-centric: a territory has at most one
-- current primary employee. An employee may be primary for multiple territories.
do $$
begin
  if exists(
    select 1 from public.employee_territory_assignments
    where assignment_type='primary' and ended_at is null
    group by business_id,territory_id having count(*)>1
  ) then
    raise exception 'Multiple active primary employees exist for a territory. Run the Checkpoint 5 assignment audit before applying this migration.'
      using errcode='23505';
  end if;
end
$$;

drop index if exists public.employee_territories_one_current_primary;
create unique index employee_territories_one_current_primary
  on public.employee_territory_assignments(business_id,territory_id)
  where assignment_type='primary' and ended_at is null;

create or replace function public.assign_territory_employee(
  p_business_id uuid,
  p_territory_id uuid,
  p_employee_id uuid,
  p_assignment_type text,
  p_effective_from date,
  p_effective_through date default null,
  p_notes text default null
) returns uuid
language plpgsql security invoker set search_path=public as $$
declare v_assignment_id uuid;
begin
  if not public.has_business_role(p_business_id,array['owner','admin']) then
    raise exception 'Territory assignment permission denied' using errcode='42501';
  end if;
  if p_assignment_type not in ('primary','backup','secondary','temporary')
    or p_effective_from is null
    or (p_effective_through is not null and p_effective_through<p_effective_from)
    or (p_assignment_type='temporary' and p_effective_through is null) then
    raise exception 'Invalid territory assignment' using errcode='22023';
  end if;
  if not exists(select 1 from public.workforce_territories
    where business_id=p_business_id and id=p_territory_id and is_active) then
    raise exception 'Territory is unavailable' using errcode='23503';
  end if;
  if not exists(select 1 from public.employees
    where business_id=p_business_id and id=p_employee_id and is_active) then
    raise exception 'Employee is unavailable' using errcode='23503';
  end if;

  if p_assignment_type='primary' then
    update public.employee_territory_assignments
    set ended_at=now(),ended_by=auth.uid()
    where business_id=p_business_id and territory_id=p_territory_id
      and assignment_type='primary' and ended_at is null;
  end if;

  insert into public.employee_territory_assignments(
    business_id,territory_id,employee_id,assignment_type,
    effective_from,effective_through,notes,created_by
  ) values(
    p_business_id,p_territory_id,p_employee_id,p_assignment_type,
    p_effective_from,p_effective_through,nullif(btrim(p_notes),''),
    auth.uid()
  ) returning id into v_assignment_id;
  return v_assignment_id;
end
$$;
revoke all on function public.assign_territory_employee(uuid,uuid,uuid,text,date,date,text) from public;
grant execute on function public.assign_territory_employee(uuid,uuid,uuid,text,date,date,text) to authenticated;

comment on function public.assign_territory_employee(uuid,uuid,uuid,text,date,date,text) is
  'Atomic tenant-authorized territory coverage assignment. Primary replacement closes the prior territory primary in the same transaction.';

-- Keep the existing technician compatibility projection synchronized while
-- preserving the normalized assignment records as the source of truth.
create or replace function public.sync_employee_territories_to_technician(
  p_business_id uuid,
  p_employee_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_technician_id uuid;
  v_service_areas text[];
begin
  select tp.id into v_technician_id
  from public.technician_profiles tp
  where tp.business_id=p_business_id and tp.employee_id=p_employee_id;

  if v_technician_id is null then return; end if;

  select coalesce(array_agg(ranked.name order by ranked.assignment_rank,ranked.name),'{}'::text[])
  into v_service_areas
  from (
    select territory.name,
      min(case assignment.assignment_type
        when 'primary' then 1
        when 'backup' then 2
        when 'secondary' then 3
        else 4
      end) as assignment_rank
    from public.employee_territory_assignments assignment
    join public.workforce_territories territory
      on territory.business_id=assignment.business_id
      and territory.id=assignment.territory_id
      and territory.is_active
    where assignment.business_id=p_business_id
      and assignment.employee_id=p_employee_id
      and assignment.ended_at is null
      and assignment.effective_from<=current_date
      and (assignment.effective_through is null or assignment.effective_through>=current_date)
    group by territory.name
  ) ranked;

  update public.technician_profiles
  set service_areas=v_service_areas,updated_at=now()
  where business_id=p_business_id and id=v_technician_id;
end
$$;
revoke all on function public.sync_employee_territories_to_technician(uuid,uuid) from public;

commit;
