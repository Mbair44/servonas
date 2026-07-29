begin;

-- Resolve the technician who should own newly matched service locations.
-- Primary coverage remains authoritative. If a territory has no primary,
-- use the highest-priority active assignable coverage so a visibly covered
-- territory does not leave new customers without a technician.
create or replace function public.resolve_territory_default_technician(
  p_business_id uuid,
  p_territory_id uuid
) returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select profile.id
  from public.employee_territory_assignments assignment
  join public.technician_profiles profile
    on profile.business_id=assignment.business_id
   and profile.employee_id=assignment.employee_id
   and profile.is_active
   and profile.is_technician
   and profile.can_be_assigned_jobs
  where assignment.business_id=p_business_id
    and assignment.territory_id=p_territory_id
    and assignment.ended_at is null
    and assignment.effective_from<=current_date
    and (
      assignment.effective_through is null
      or assignment.effective_through>=current_date
    )
  order by
    case assignment.assignment_type
      when 'primary' then 1
      when 'temporary' then 2
      when 'secondary' then 3
      when 'backup' then 4
      else 5
    end,
    assignment.effective_from desc,
    assignment.created_at desc,
    assignment.id
  limit 1
$$;

create or replace function public.set_service_location_operational_assignment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_territory_id uuid;
  v_technician_id uuid;
begin
  if new.operational_assignment_source='manual' then
    new.operational_assignment_status:=case
      when new.territory_id is not null and new.default_technician_id is not null then 'assigned'
      when new.territory_id is not null then 'territory_only'
      when new.default_technician_id is not null then 'technician_only'
      else 'unassigned'
    end;
    new.operational_assignment_updated_at:=now();
    return new;
  end if;

  select territory.id
  into v_territory_id
  from public.workforce_territories territory
  where territory.business_id=new.business_id
    and territory.is_active
    and public.territory_matches_service_location(territory,new)
  order by
    case
      when public.territory_geometry_contains(
        territory.boundary_geojson,new.latitude,new.longitude
      ) then 0
      when public.normalize_territory_postal_code(new.postal_code)<>''
       and exists(
         select 1
         from unnest(territory.postal_codes) value
         where public.normalize_territory_postal_code(value)
           =public.normalize_territory_postal_code(new.postal_code)
       ) then 1
      when territory.territory_type='radius' then 2
      when territory.territory_type='city_boundaries' then 3
      else 4
    end,
    territory.version desc,
    territory.name
  limit 1;

  if v_territory_id is not null then
    v_technician_id:=public.resolve_territory_default_technician(
      new.business_id,
      v_territory_id
    );
  end if;

  new.territory_id:=v_territory_id;
  new.default_technician_id:=v_technician_id;
  new.operational_assignment_source:='automatic';
  new.operational_assignment_status:=case
    when v_territory_id is not null and v_technician_id is not null then 'assigned'
    when v_territory_id is not null then 'territory_only'
    else 'unassigned'
  end;
  new.operational_assignment_updated_at:=now();
  return new;
end
$$;

-- Keep existing automatically managed service locations synchronized whenever
-- technician coverage for their territory changes.
create or replace function public.refresh_territory_service_location_assignments()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_business_id uuid:=coalesce(new.business_id,old.business_id);
  v_territory_id uuid:=coalesce(new.territory_id,old.territory_id);
begin
  update public.service_locations
  set operational_assignment_source='automatic',
      operational_assignment_updated_at=now()
  where business_id=v_business_id
    and territory_id=v_territory_id
    and operational_assignment_source='automatic'
    and is_active
    and not is_deleted;
  return coalesce(new,old);
end
$$;

drop trigger if exists employee_territory_refresh_service_locations
  on public.employee_territory_assignments;
create trigger employee_territory_refresh_service_locations
after insert or update or delete
on public.employee_territory_assignments
for each row
execute function public.refresh_territory_service_location_assignments();

-- Repair existing automatic location assignments immediately.
update public.service_locations
set operational_assignment_source='automatic',
    operational_assignment_updated_at=now()
where operational_assignment_source='automatic'
  and is_active
  and not is_deleted;

revoke all on function public.resolve_territory_default_technician(uuid,uuid)
  from public;
revoke all on function public.refresh_territory_service_location_assignments()
  from public;
revoke all on function public.set_service_location_operational_assignment()
  from public;

comment on function public.resolve_territory_default_technician(uuid,uuid) is
  'Returns the active assignable technician profile for a territory, preferring primary coverage and falling back deterministically when no primary exists.';

commit;
