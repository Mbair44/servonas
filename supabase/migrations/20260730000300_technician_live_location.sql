begin;

create table public.technician_live_locations(
 business_id uuid not null references public.businesses(id) on delete cascade,
 technician_id uuid primary key references public.technician_profiles(id) on delete cascade,
 active_job_id uuid references public.jobs(id) on delete set null,
 latitude numeric(10,7) not null check(latitude between -90 and 90),
 longitude numeric(10,7) not null check(longitude between -180 and 180),
 accuracy_meters numeric(9,2) not null check(accuracy_meters>=0),
 heading_degrees numeric(6,2),
 speed_meters_per_second numeric(8,2),
 tracking_active boolean not null default true,
 consent_started_at timestamptz not null default now(),
 geofence_entered_at timestamptz,
 captured_at timestamptz not null,
 updated_at timestamptz not null default now()
);
create index technician_live_locations_business_active_idx on public.technician_live_locations(business_id,tracking_active,updated_at desc);
alter table public.technician_live_locations enable row level security;
create policy "technicians read own live location" on public.technician_live_locations for select to authenticated
 using(exists(select 1 from public.technician_profiles p where p.id=technician_id and p.member_user_id=auth.uid()));
create policy "dispatch reads technician live locations" on public.technician_live_locations for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager','dispatcher']));

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
 select * into v_profile from public.technician_profiles where id=v_job.assigned_technician_id and member_user_id=auth.uid() and is_active and is_technician;
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

create or replace function public.stop_technician_live_location(p_job_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.technician_live_locations l set tracking_active=false,active_job_id=null,geofence_entered_at=null,updated_at=now()
 where l.active_job_id=p_job_id and exists(select 1 from public.technician_profiles p where p.id=l.technician_id and p.member_user_id=auth.uid());
end$$;
revoke all on function public.record_technician_live_location(uuid,numeric,numeric,numeric,timestamptz,numeric,numeric,boolean) from public;
grant execute on function public.record_technician_live_location(uuid,numeric,numeric,numeric,timestamptz,numeric,numeric,boolean) to authenticated;
revoke all on function public.stop_technician_live_location(uuid) from public;
grant execute on function public.stop_technician_live_location(uuid) to authenticated;

create or replace function public.stop_live_location_for_closed_job()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.status in('completed','canceled','declined') and old.status is distinct from new.status then
  update public.technician_live_locations set tracking_active=false,active_job_id=null,geofence_entered_at=null,updated_at=now()
  where active_job_id=new.id;
 end if;
 return new;
end$$;
create trigger jobs_stop_live_location_after_close after update of status on public.jobs
for each row execute function public.stop_live_location_for_closed_job();

commit;
