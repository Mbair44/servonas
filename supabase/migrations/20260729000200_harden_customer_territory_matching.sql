-- Harden automatic territory matching for normalized addresses. In particular,
-- US ZIP+4 customer addresses must match five-digit territory definitions.
begin;

create or replace function public.normalize_territory_postal_code(p_value text)
returns text language sql immutable set search_path=public as $$
  select case
    when regexp_replace(coalesce(p_value,''),'[^0-9]','','g') ~ '^[0-9]{5}'
      then left(regexp_replace(p_value,'[^0-9]','','g'),5)
    else lower(regexp_replace(btrim(coalesce(p_value,'')),'[\s-]','','g'))
  end;
$$;

create or replace function public.territory_matches_service_location(
  p_territory public.workforce_territories,
  p_location public.service_locations
) returns boolean language plpgsql stable set search_path=public as $$
declare
  v_center jsonb:=p_territory.strategy_config->'center';
  v_radius double precision;
  v_latitude double precision:=p_location.latitude::double precision;
  v_longitude double precision:=p_location.longitude::double precision;
  v_distance double precision;
  v_city text:=lower(btrim(coalesce(p_location.city,'')));
  v_neighborhood text:=lower(btrim(coalesce(p_location.location_name,'')));
begin
  if public.territory_geometry_contains(p_territory.boundary_geojson,p_location.latitude,p_location.longitude) then
    return true;
  end if;
  if public.normalize_territory_postal_code(p_location.postal_code)<>'' and exists(
    select 1 from unnest(p_territory.postal_codes) value
    where public.normalize_territory_postal_code(value)
      =public.normalize_territory_postal_code(p_location.postal_code)
  ) then return true; end if;
  if v_city<>'' and (
    exists(
      select 1
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_territory.strategy_config->'cities')='array'
          then p_territory.strategy_config->'cities' else '[]'::jsonb end
      ) value
      where lower(btrim(value))=v_city
    )
    or (p_territory.territory_type='city_boundaries' and lower(btrim(p_territory.name))=v_city)
  ) then return true; end if;
  if v_neighborhood<>'' and (
    exists(
      select 1 from unnest(p_territory.neighborhoods) value
      where lower(btrim(value))=v_neighborhood
    )
    or (p_territory.territory_type='neighborhoods' and lower(btrim(p_territory.name))=v_neighborhood)
  ) then return true; end if;
  if v_center is not null and p_territory.strategy_config?'radius_meters'
    and v_latitude is not null and v_longitude is not null then
    v_radius:=(p_territory.strategy_config->>'radius_meters')::double precision;
    v_distance:=6371000*2*asin(sqrt(
      power(sin(radians((v_latitude-(v_center->>'latitude')::double precision)/2)),2)
      +cos(radians((v_center->>'latitude')::double precision))*cos(radians(v_latitude))
      *power(sin(radians((v_longitude-(v_center->>'longitude')::double precision)/2)),2)
    ));
    return v_distance<=v_radius;
  end if;
  return false;
exception when others then
  return false;
end $$;

create or replace function public.set_service_location_operational_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
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

  select territory.id into v_territory_id
  from public.workforce_territories territory
  where territory.business_id=new.business_id and territory.is_active
    and public.territory_matches_service_location(territory,new)
  order by
    case
      when public.territory_geometry_contains(territory.boundary_geojson,new.latitude,new.longitude) then 0
      when public.normalize_territory_postal_code(new.postal_code)<>''
        and exists(select 1 from unnest(territory.postal_codes) value
          where public.normalize_territory_postal_code(value)=public.normalize_territory_postal_code(new.postal_code)) then 1
      when territory.territory_type='radius' then 2
      when territory.territory_type='city_boundaries' then 3
      else 4
    end,
    territory.version desc,territory.name
  limit 1;

  if v_territory_id is not null then
    select profile.id into v_technician_id
    from public.employee_territory_assignments assignment
    join public.technician_profiles profile
      on profile.business_id=assignment.business_id
      and profile.employee_id=assignment.employee_id
      and profile.is_active and profile.is_technician and profile.can_be_assigned_jobs
    where assignment.business_id=new.business_id
      and assignment.territory_id=v_territory_id
      and assignment.assignment_type='primary'
      and assignment.ended_at is null
      and assignment.effective_from<=current_date
      and (assignment.effective_through is null or assignment.effective_through>=current_date)
    order by assignment.effective_from desc,assignment.created_at desc
    limit 1;
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
end $$;

-- Re-run the assignment trigger for all automatically managed active locations.
update public.service_locations
set operational_assignment_source='automatic',
    operational_assignment_updated_at=now()
where operational_assignment_source='automatic'
  and is_active and not is_deleted;

revoke all on function public.normalize_territory_postal_code(text) from public;
revoke all on function public.territory_matches_service_location(public.workforce_territories,public.service_locations) from public;
revoke all on function public.set_service_location_operational_assignment() from public;

commit;
