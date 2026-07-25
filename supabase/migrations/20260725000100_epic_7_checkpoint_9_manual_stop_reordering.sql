begin;

create or replace function public.reorder_technician_route_stops(
  p_business_id uuid,
  p_technician_route_id uuid,
  p_ordered_job_ids uuid[],
  p_confirm_active boolean default false
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_plan_id uuid;
  v_expected integer;
  v_locked integer;
  v_protected integer;
begin
  if not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Route management permission required' using errcode='42501';
  end if;
  select route_plan_id into v_plan_id
  from public.technician_routes
  where id=p_technician_route_id and business_id=p_business_id
  for update;
  if v_plan_id is null then
    raise exception 'Technician route not found' using errcode='P0002';
  end if;

  select count(*) into v_expected from public.route_stops
  where business_id=p_business_id and technician_route_id=p_technician_route_id;
  if coalesce(array_length(p_ordered_job_ids,1),0)<>v_expected
    or (select count(distinct value) from unnest(p_ordered_job_ids) value)<>v_expected
    or exists (
      select 1 from unnest(p_ordered_job_ids) value
      where not exists (
        select 1 from public.route_stops rs
        where rs.business_id=p_business_id
          and rs.technician_route_id=p_technician_route_id
          and rs.job_id=value
      )
    ) then
    raise exception 'Stop order must contain every route job exactly once'
      using errcode='22023';
  end if;

  select count(*) into v_locked
  from public.route_stops current_stop
  join unnest(p_ordered_job_ids) with ordinality requested(job_id,new_sequence)
    on requested.job_id=current_stop.job_id
  where current_stop.business_id=p_business_id
    and current_stop.technician_route_id=p_technician_route_id
    and current_stop.is_locked
    and current_stop.sequence<>requested.new_sequence;
  if v_locked>0 then
    raise exception 'Locked stops cannot be moved' using errcode='55000';
  end if;

  select count(*) into v_protected
  from public.route_stops current_stop
  join public.jobs j on j.id=current_stop.job_id and j.business_id=current_stop.business_id
  join unnest(p_ordered_job_ids) with ordinality requested(job_id,new_sequence)
    on requested.job_id=current_stop.job_id
  where current_stop.business_id=p_business_id
    and current_stop.technician_route_id=p_technician_route_id
    and current_stop.sequence<>requested.new_sequence
    and (
      j.status='completed'
      or (j.status in ('en_route','arrived','in_progress') and not p_confirm_active)
    );
  if v_protected>0 then
    raise exception 'Completed stops cannot move; active stops require confirmation'
      using errcode='55000';
  end if;

  -- Move outside the live sequence range first to avoid the composite unique index.
  update public.route_stops
  set sequence=sequence+100000
  where business_id=p_business_id and technician_route_id=p_technician_route_id;

  update public.route_stops rs
  set sequence=requested.new_sequence,
      manual_override=true,
      calculation_status='stale',
      updated_by=auth.uid()
  from unnest(p_ordered_job_ids) with ordinality requested(job_id,new_sequence)
  where rs.business_id=p_business_id
    and rs.technician_route_id=p_technician_route_id
    and rs.job_id=requested.job_id;

  delete from public.route_legs
  where business_id=p_business_id and technician_route_id=p_technician_route_id;

  update public.technician_routes
  set calculation_status='stale',stale_at=now(),encoded_polyline=null,
      driving_distance_meters=null,driving_duration_seconds=null,
      calculation_signature=null,updated_by=auth.uid()
  where business_id=p_business_id and id=p_technician_route_id;

  update public.route_plans
  set calculation_status='stale',stale_at=now(),version=version+1,updated_by=auth.uid()
  where business_id=p_business_id and id=v_plan_id;
end;
$$;

revoke all on function public.reorder_technician_route_stops(uuid,uuid,uuid[],boolean) from public;
grant execute on function public.reorder_technician_route_stops(uuid,uuid,uuid[],boolean)
  to authenticated,service_role;

comment on function public.reorder_technician_route_stops(uuid,uuid,uuid[],boolean) is
  'Atomically validates and applies an authorized manual stop order, preserving locked/completed stops and invalidating only the affected technician route.';

commit;
