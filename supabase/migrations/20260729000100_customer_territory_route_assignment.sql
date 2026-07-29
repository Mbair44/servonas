-- Automatically connect customer service locations to operating territories
-- and each territory's current primary technician. Routes remain derived from
-- scheduled jobs; unscheduled customers never become artificial route stops.
begin;

alter table public.service_locations
  add column if not exists territory_id uuid,
  add column if not exists default_technician_id uuid,
  add column if not exists operational_assignment_source text not null default 'automatic',
  add column if not exists operational_assignment_status text not null default 'unassigned',
  add column if not exists operational_assignment_updated_at timestamptz;

alter table public.service_locations
  drop constraint if exists service_locations_territory_tenant_fk,
  add constraint service_locations_territory_tenant_fk
    foreign key(business_id,territory_id)
    references public.workforce_territories(business_id,id) on delete set null,
  drop constraint if exists service_locations_default_technician_tenant_fk,
  add constraint service_locations_default_technician_tenant_fk
    foreign key(business_id,default_technician_id)
    references public.technician_profiles(business_id,id) on delete set null,
  drop constraint if exists service_locations_assignment_source_check,
  add constraint service_locations_assignment_source_check
    check(operational_assignment_source in ('automatic','manual')),
  drop constraint if exists service_locations_assignment_status_check,
  add constraint service_locations_assignment_status_check
    check(operational_assignment_status in ('assigned','territory_only','technician_only','unassigned'));

create index if not exists service_locations_territory_idx
  on public.service_locations(business_id,territory_id)
  where is_active and not is_deleted;
create index if not exists service_locations_default_technician_idx
  on public.service_locations(business_id,default_technician_id)
  where is_active and not is_deleted;

create or replace function public.territory_ring_contains(
  p_ring jsonb,p_latitude numeric,p_longitude numeric
) returns boolean language plpgsql immutable strict set search_path=public as $$
declare
  v_inside boolean:=false;
  v_count integer:=jsonb_array_length(p_ring);
  v_i integer;
  v_j integer;
  v_xi numeric;
  v_yi numeric;
  v_xj numeric;
  v_yj numeric;
begin
  if v_count<3 then return false; end if;
  v_j:=v_count-1;
  for v_i in 0..v_count-1 loop
    v_xi:=(p_ring->v_i->>0)::numeric;
    v_yi:=(p_ring->v_i->>1)::numeric;
    v_xj:=(p_ring->v_j->>0)::numeric;
    v_yj:=(p_ring->v_j->>1)::numeric;
    if ((v_yi>p_latitude)<>(v_yj>p_latitude))
      and p_longitude<((v_xj-v_xi)*(p_latitude-v_yi)/nullif(v_yj-v_yi,0)+v_xi) then
      v_inside:=not v_inside;
    end if;
    v_j:=v_i;
  end loop;
  return v_inside;
exception when others then
  return false;
end $$;

create or replace function public.territory_geometry_contains(
  p_geometry jsonb,p_latitude numeric,p_longitude numeric
) returns boolean language plpgsql immutable set search_path=public as $$
declare
  v_polygon jsonb;
  v_ring jsonb;
  v_inside boolean;
begin
  if p_geometry is null or p_latitude is null or p_longitude is null then return false; end if;
  for v_polygon in
    select value from jsonb_array_elements(
      case p_geometry->>'type'
        when 'Polygon' then jsonb_build_array(p_geometry->'coordinates')
        when 'MultiPolygon' then p_geometry->'coordinates'
        else '[]'::jsonb
      end
    )
  loop
    if jsonb_array_length(v_polygon)=0 then continue; end if;
    v_inside:=public.territory_ring_contains(v_polygon->0,p_latitude,p_longitude);
    if v_inside then
      for v_ring in select value from jsonb_array_elements(v_polygon) offset 1 loop
        if public.territory_ring_contains(v_ring,p_latitude,p_longitude) then
          v_inside:=false;
          exit;
        end if;
      end loop;
    end if;
    if v_inside then return true; end if;
  end loop;
  return false;
end $$;

create or replace function public.territory_matches_service_location(
  p_territory public.workforce_territories,
  p_location public.service_locations
) returns boolean language plpgsql stable set search_path=public as $$
declare
  v_center jsonb:=p_territory.strategy_config->'center';
  v_radius numeric;
  v_distance numeric;
begin
  if public.territory_geometry_contains(p_territory.boundary_geojson,p_location.latitude,p_location.longitude) then
    return true;
  end if;
  if coalesce(p_location.postal_code,'')<>'' and exists(
    select 1 from unnest(p_territory.postal_codes) value
    where lower(btrim(value))=lower(btrim(p_location.postal_code))
  ) then return true; end if;
  if coalesce(p_location.city,'')<>'' and exists(
    select 1 from jsonb_array_elements_text(coalesce(p_territory.strategy_config->'cities','[]'::jsonb)) value
    where lower(btrim(value))=lower(btrim(p_location.city))
  ) then return true; end if;
  if coalesce(p_location.location_name,'')<>'' and exists(
    select 1 from unnest(p_territory.neighborhoods) value
    where lower(btrim(value))=lower(btrim(p_location.location_name))
  ) then return true; end if;
  if v_center is not null and p_territory.strategy_config?'radius_meters'
    and p_location.latitude is not null and p_location.longitude is not null then
    v_radius:=(p_territory.strategy_config->>'radius_meters')::numeric;
    v_distance:=6371000*2*asin(sqrt(
      power(sin(radians((p_location.latitude-(v_center->>'latitude')::numeric)/2)),2)
      +cos(radians((v_center->>'latitude')::numeric))*cos(radians(p_location.latitude))
      *power(sin(radians((p_location.longitude-(v_center->>'longitude')::numeric)/2)),2)
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
      when new.postal_code=any(territory.postal_codes) then 1
      when territory.territory_type='radius' then 2
      else 3
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

drop trigger if exists service_locations_assign_operations on public.service_locations;
create trigger service_locations_assign_operations
before insert or update of street_address,city,state,postal_code,latitude,longitude,
  location_name,operational_assignment_source,territory_id,default_technician_id
on public.service_locations
for each row execute function public.set_service_location_operational_assignment();

create or replace function public.inherit_job_location_technician()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_technician_id uuid;
  v_assignment_id uuid;
begin
  if new.assigned_technician_id is not null or new.service_location_id is null then return new; end if;
  select default_technician_id into v_technician_id
  from public.service_locations
  where business_id=new.business_id and id=new.service_location_id
    and is_active and not is_deleted;
  if v_technician_id is null then return new; end if;

  perform set_config('servonas.assignment_sync','on',true);
  insert into public.job_assignments(
    business_id,job_id,technician_id,assignment_role,assigned_by
  ) values (
    new.business_id,new.id,v_technician_id,'primary',coalesce(auth.uid(),new.created_by)
  ) returning id into v_assignment_id;
  update public.jobs
  set assigned_technician_id=v_technician_id,
      updated_by=coalesce(auth.uid(),new.updated_by)
  where business_id=new.business_id and id=new.id;
  perform set_config('servonas.assignment_sync','off',true);
  return new;
end $$;

drop trigger if exists jobs_inherit_location_technician on public.jobs;
create trigger jobs_inherit_location_technician
after insert on public.jobs
for each row execute function public.inherit_job_location_technician();

-- Backfill every active location. Existing manual choices do not exist before
-- this migration, so the automatic trigger is authoritative for this pass.
update public.service_locations
set operational_assignment_source='automatic',
    operational_assignment_updated_at=now()
where is_active and not is_deleted;

revoke all on function public.territory_ring_contains(jsonb,numeric,numeric) from public;
revoke all on function public.territory_geometry_contains(jsonb,numeric,numeric) from public;
revoke all on function public.territory_matches_service_location(public.workforce_territories,public.service_locations) from public;
revoke all on function public.set_service_location_operational_assignment() from public;
revoke all on function public.inherit_job_location_technician() from public;

comment on column public.service_locations.territory_id is
  'Operating territory matched from this service address or selected manually.';
comment on column public.service_locations.default_technician_id is
  'Technician inherited by newly scheduled jobs at this location when no explicit technician is selected.';
comment on column public.service_locations.operational_assignment_status is
  'Readiness for scheduled work. Route stops are created only for dated jobs, never for standalone customers.';

commit;
