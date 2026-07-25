begin;

create or replace function public.reorder_technician_route_stops_versioned(
  p_business_id uuid,
  p_technician_route_id uuid,
  p_ordered_job_ids uuid[],
  p_expected_plan_version bigint,
  p_confirm_active boolean default false
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_plan_id uuid;
  v_current_version bigint;
begin
  select tr.route_plan_id,rp.version
    into v_plan_id,v_current_version
  from public.technician_routes tr
  join public.route_plans rp
    on rp.id=tr.route_plan_id and rp.business_id=tr.business_id
  where tr.id=p_technician_route_id and tr.business_id=p_business_id
  for update of rp;

  if v_plan_id is null then
    raise exception 'Route plan not found' using errcode='P0002';
  end if;
  if v_current_version<>p_expected_plan_version then
    raise exception 'This route changed while you were editing it. Refresh the route plan before applying your changes.'
      using errcode='40001',
        detail=format('expected_version=%s current_version=%s',p_expected_plan_version,v_current_version);
  end if;

  perform public.reorder_technician_route_stops(
    p_business_id,p_technician_route_id,p_ordered_job_ids,p_confirm_active
  );
end;
$$;

revoke all on function public.reorder_technician_route_stops_versioned(uuid,uuid,uuid[],bigint,boolean) from public;
grant execute on function public.reorder_technician_route_stops_versioned(uuid,uuid,uuid[],bigint,boolean)
  to authenticated,service_role;

create or replace function public.reassign_dispatch_job_versioned(
  p_business_id uuid,
  p_route_plan_id uuid,
  p_job_id uuid,
  p_technician_id uuid,
  p_expected_plan_version bigint
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_current_version bigint;
  v_service_date date;
  v_job_date date;
  v_assignment_id uuid;
begin
  select version,service_date into v_current_version,v_service_date
  from public.route_plans
  where id=p_route_plan_id and business_id=p_business_id
  for update;

  if v_current_version is null then
    raise exception 'Route plan not found' using errcode='P0002';
  end if;
  if v_current_version<>p_expected_plan_version then
    raise exception 'This route changed while you were editing it. Refresh the route plan before applying your changes.'
      using errcode='40001',
        detail=format('expected_version=%s current_version=%s',p_expected_plan_version,v_current_version);
  end if;

  select (j.starts_at at time zone coalesce(b.timezone,'UTC'))::date into v_job_date
  from public.jobs j
  join public.businesses b on b.id=j.business_id
  where j.id=p_job_id and j.business_id=p_business_id and not j.is_deleted;
  if v_job_date is null or v_job_date<>v_service_date then
    raise exception 'Job does not belong to this route plan date' using errcode='22023';
  end if;

  v_assignment_id=public.set_job_primary_technician(p_job_id,p_technician_id);
  update public.route_plans
  set updated_by=auth.uid()
  where id=p_route_plan_id and business_id=p_business_id;
  return v_assignment_id;
end;
$$;

revoke all on function public.reassign_dispatch_job_versioned(uuid,uuid,uuid,uuid,bigint) from public;
grant execute on function public.reassign_dispatch_job_versioned(uuid,uuid,uuid,uuid,bigint)
  to authenticated,service_role;

comment on function public.reorder_technician_route_stops_versioned(uuid,uuid,uuid[],bigint,boolean) is
  'Locks and compares the route-plan version before applying an atomic stop reorder.';
comment on function public.reassign_dispatch_job_versioned(uuid,uuid,uuid,uuid,bigint) is
  'Locks and compares the route-plan version before changing the authoritative primary assignment.';

commit;
