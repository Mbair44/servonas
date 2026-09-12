begin;

-- Preserve existing single-technician jobs in the assignment model.
select set_config('servonas.assignment_sync','on',true);
insert into public.job_assignments (
  business_id, job_id, technician_id, assignment_role, assigned_by
)
select j.business_id, j.id, j.assigned_technician_id, 'primary', j.updated_by
from public.jobs j
where j.assigned_technician_id is not null
  and j.is_deleted = false
  and not exists (
    select 1
    from public.job_assignments a
    where a.job_id = j.id
      and a.technician_id = j.assigned_technician_id
      and a.is_active = true
  );
select set_config('servonas.assignment_sync','off',true);

create or replace function public.set_job_technicians(
  p_job_id uuid,
  p_technician_ids uuid[]
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_business_id uuid;
  v_ids uuid[];
  v_technician_id uuid;
  v_position integer := 0;
begin
  select business_id into v_business_id
  from public.jobs
  where id=p_job_id and is_deleted=false
  for update;

  if v_business_id is null then
    raise exception 'Job not found' using errcode='no_data_found';
  end if;
  if not (
    public.has_business_role(v_business_id,array['owner','admin','manager'])
    or coalesce(auth.role(),'')='service_role'
  ) then
    raise exception 'Permission denied' using errcode='insufficient_privilege';
  end if;

  select coalesce(array_agg(id order by first_position), array[]::uuid[])
  into v_ids
  from (
    select id, min(position) as first_position
    from unnest(coalesce(p_technician_ids,array[]::uuid[])) with ordinality as requested(id,position)
    where id is not null
    group by id
  ) deduplicated;

  if exists (
    select 1 from unnest(v_ids) requested(id)
    where not exists (
      select 1 from public.technician_profiles technician
      where technician.id=requested.id
        and technician.business_id=v_business_id
        and technician.is_active=true
        and technician.is_technician=true
        and technician.can_be_assigned_jobs=true
    )
  ) then
    raise exception 'Technician is not assignable to this job'
      using errcode='foreign_key_violation';
  end if;

  perform set_config('servonas.assignment_sync','on',true);

  update public.job_assignments
  set is_active=false, removed_at=now(), removed_by=auth.uid()
  where business_id=v_business_id and job_id=p_job_id and is_active=true;

  foreach v_technician_id in array v_ids loop
    v_position := v_position + 1;
    insert into public.job_assignments (
      business_id, job_id, technician_id, assignment_role, assigned_by
    ) values (
      v_business_id, p_job_id, v_technician_id,
      case when v_position=1 then 'primary' else 'helper' end,
      auth.uid()
    );
  end loop;

  update public.jobs
  set assigned_technician_id=v_ids[1], updated_by=auth.uid()
  where id=p_job_id and business_id=v_business_id;

  perform set_config('servonas.assignment_sync','off',true);
end;
$$;

revoke all on function public.set_job_technicians(uuid,uuid[]) from public;
grant execute on function public.set_job_technicians(uuid,uuid[]) to authenticated,service_role;

create or replace function public.is_assigned_technician(
  p_business_id uuid,
  p_job_id uuid
) returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from public.technician_profiles technician
    where technician.business_id=p_business_id
      and technician.member_user_id=auth.uid()
      and technician.is_active=true
      and technician.is_technician=true
      and (
        exists (
          select 1 from public.job_assignments assignment
          where assignment.business_id=p_business_id
            and assignment.job_id=p_job_id
            and assignment.technician_id=technician.id
            and assignment.is_active=true
        )
        or exists (
          select 1 from public.jobs job
          where job.business_id=p_business_id
            and job.id=p_job_id
            and job.assigned_technician_id=technician.id
            and job.is_deleted=false
        )
      )
  );
$$;

revoke all on function public.is_assigned_technician(uuid,uuid) from public;
grant execute on function public.is_assigned_technician(uuid,uuid) to authenticated,service_role;

create or replace function public.record_technician_live_location(
 p_job_id uuid,p_latitude numeric,p_longitude numeric,p_accuracy_meters numeric,
 p_captured_at timestamptz,p_heading_degrees numeric default null,p_speed_meters_per_second numeric default null,
 p_start_travel boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_job public.jobs%rowtype;v_profile public.technician_profiles%rowtype;v_location public.service_locations%rowtype;
 v_distance numeric;v_entered timestamptz;v_arrived boolean:=false;v_now timestamptz:=now();
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_accuracy_meters<0 or p_accuracy_meters>5000 then raise exception 'Invalid location reading' using errcode='22023';end if;
 if p_captured_at<v_now-interval '10 minutes' or p_captured_at>v_now+interval '2 minutes' then raise exception 'Stale location reading' using errcode='22023';end if;
 select * into v_job from public.jobs where id=p_job_id and not is_deleted for update;
 select profile.* into v_profile
 from public.technician_profiles profile
 join public.job_assignments assignment
   on assignment.business_id=profile.business_id
  and assignment.technician_id=profile.id
  and assignment.job_id=p_job_id
  and assignment.is_active=true
 where profile.member_user_id=auth.uid() and profile.is_active and profile.is_technician
 limit 1;
 if v_job.id is null or v_profile.id is null then raise exception 'Assigned technician job not found' using errcode='42501';end if;
 if p_start_travel and v_job.status='dispatched' then
  perform public.transition_assigned_job_status(v_job.id,'en_route');
  v_job.status:='en_route';
 end if;
 if v_job.status not in('en_route','arrived','in_progress') then raise exception 'Location sharing is unavailable for this job status' using errcode='23514';end if;
 select * into v_location from public.service_locations where id=v_job.service_location_id and business_id=v_job.business_id;
 if v_location.latitude is not null and v_location.longitude is not null then
  v_distance:=6371000*2*asin(sqrt(
   power(sin(radians((p_latitude-v_location.latitude)/2)),2)+
   cos(radians(v_location.latitude))*cos(radians(p_latitude))*power(sin(radians((p_longitude-v_location.longitude)/2)),2)
  ));
 end if;
 select geofence_entered_at into v_entered from public.technician_live_locations where technician_id=v_profile.id;
 if v_job.status='en_route' and p_accuracy_meters<=100 and v_distance<=150 then
  v_entered:=coalesce(v_entered,v_now);
  if v_now-v_entered>=interval '30 seconds' then
   perform public.transition_assigned_job_status(v_job.id,'arrived');v_job.status:='arrived';v_arrived:=true;
  end if;
 else
  v_entered:=null;
 end if;
 insert into public.technician_live_locations(
  business_id,technician_id,active_job_id,latitude,longitude,accuracy_meters,heading_degrees,speed_meters_per_second,
  tracking_active,consent_started_at,geofence_entered_at,captured_at,updated_at
 ) values(
  v_job.business_id,v_profile.id,v_job.id,p_latitude,p_longitude,p_accuracy_meters,p_heading_degrees,p_speed_meters_per_second,
  true,v_now,v_entered,p_captured_at,v_now
 ) on conflict(technician_id) do update set
  business_id=excluded.business_id,active_job_id=excluded.active_job_id,latitude=excluded.latitude,longitude=excluded.longitude,
  accuracy_meters=excluded.accuracy_meters,heading_degrees=excluded.heading_degrees,speed_meters_per_second=excluded.speed_meters_per_second,
  tracking_active=true,consent_started_at=case when technician_live_locations.tracking_active then technician_live_locations.consent_started_at else v_now end,
  geofence_entered_at=excluded.geofence_entered_at,captured_at=excluded.captured_at,updated_at=v_now;
 return jsonb_build_object('job_status',v_job.status,'distance_meters',v_distance,'accuracy_meters',p_accuracy_meters,'arrived_automatically',v_arrived);
end$$;

-- Industry-specific technician policies must follow the same assignment rule.
drop policy if exists "assigned techs read pool logs" on public.pool_service_logs;
create policy "assigned techs read pool logs" on public.pool_service_logs
  for select to authenticated
  using (public.is_assigned_technician(business_id,job_id));
drop policy if exists "assigned techs manage pool logs" on public.pool_service_logs;
create policy "assigned techs manage pool logs" on public.pool_service_logs
  for all to authenticated
  using (public.is_assigned_technician(business_id,job_id))
  with check (public.is_assigned_technician(business_id,job_id));

commit;
