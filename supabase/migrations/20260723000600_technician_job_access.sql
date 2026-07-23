-- Epic 5 Checkpoint 6: assigned-job-only technician access.
create or replace function public.is_assigned_technician(
  p_business_id uuid,
  p_job_id uuid
) returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from public.jobs j
    join public.technician_profiles t
      on t.id=j.assigned_technician_id
     and t.business_id=j.business_id
    where j.id=p_job_id
      and j.business_id=p_business_id
      and j.is_deleted=false
      and t.member_user_id=auth.uid()
      and t.is_active=true
      and t.is_technician=true
  );
$$;
revoke all on function public.is_assigned_technician(uuid,uuid) from public;
grant execute on function public.is_assigned_technician(uuid,uuid) to authenticated,service_role;

create or replace function public.technician_can_access_customer(
  p_business_id uuid,
  p_customer_id uuid
) returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from public.jobs j
    join public.technician_profiles t
      on t.id=j.assigned_technician_id
     and t.business_id=j.business_id
    where j.business_id=p_business_id
      and j.customer_id=p_customer_id
      and j.is_deleted=false
      and t.member_user_id=auth.uid()
      and t.is_active=true
      and t.is_technician=true
  );
$$;
revoke all on function public.technician_can_access_customer(uuid,uuid) from public;
grant execute on function public.technician_can_access_customer(uuid,uuid) to authenticated,service_role;

create or replace function public.technician_can_access_location(
  p_business_id uuid,
  p_location_id uuid
) returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from public.jobs j
    join public.technician_profiles t
      on t.id=j.assigned_technician_id
     and t.business_id=j.business_id
    where j.business_id=p_business_id
      and j.service_location_id=p_location_id
      and j.is_deleted=false
      and t.member_user_id=auth.uid()
      and t.is_active=true
      and t.is_technician=true
  );
$$;
revoke all on function public.technician_can_access_location(uuid,uuid) from public;
grant execute on function public.technician_can_access_location(uuid,uuid) to authenticated,service_role;

drop policy if exists "members can view jobs" on public.jobs;
create policy "office and assigned technicians view jobs" on public.jobs
  for select to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or public.is_assigned_technician(business_id,id)
  );

drop policy if exists "members can view customers" on public.customers;
create policy "office and assigned technicians view customers" on public.customers
  for select to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or public.technician_can_access_customer(business_id,id)
  );

drop policy if exists "members can view service locations" on public.service_locations;
create policy "office and assigned technicians view locations" on public.service_locations
  for select to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or public.technician_can_access_location(business_id,id)
  );

drop policy if exists "members can view technician profiles" on public.technician_profiles;
create policy "office and technicians view technician profiles" on public.technician_profiles
  for select to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or member_user_id=auth.uid()
  );

drop policy if exists "members can view job assignments" on public.job_assignments;
create policy "office and assigned technicians view assignments" on public.job_assignments
  for select to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or public.is_assigned_technician(business_id,job_id)
  );

drop policy if exists "members can view job history" on public.job_status_history;
create policy "office and assigned technicians view job history" on public.job_status_history
  for select to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or public.is_assigned_technician(business_id,job_id)
  );

drop policy if exists "members can view job photos" on public.job_photos;
create policy "office and assigned technicians view job photos" on public.job_photos
  for select to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    or public.is_assigned_technician(business_id,job_id)
  );
drop policy if exists "assigned technicians add job photos" on public.job_photos;
create policy "assigned technicians add job photos" on public.job_photos
  for insert to authenticated with check (
    uploaded_by=auth.uid()
    and public.is_assigned_technician(business_id,job_id)
  );

drop policy if exists "members can read job photo objects" on storage.objects;
create policy "office and assigned technicians read job photo objects" on storage.objects
  for select to authenticated using (
    bucket_id='job-photos'
    and (
      public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager'])
      or public.is_assigned_technician(
        ((storage.foldername(name))[1])::uuid,
        ((storage.foldername(name))[2])::uuid
      )
    )
  );
drop policy if exists "assigned technicians upload job photo objects" on storage.objects;
create policy "assigned technicians upload job photo objects" on storage.objects
  for insert to authenticated with check (
    bucket_id='job-photos'
    and public.is_assigned_technician(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  );

create or replace function public.transition_assigned_job_status(
  p_job_id uuid,
  p_status text
) returns text
language plpgsql security definer set search_path=public
as $$
declare
  v_job public.jobs%rowtype;
  v_allowed boolean;
begin
  select * into v_job from public.jobs
  where id=p_job_id and is_deleted=false
  for update;
  if v_job.id is null or not public.is_assigned_technician(v_job.business_id,v_job.id) then
    raise exception 'Assigned job not found' using errcode='insufficient_privilege';
  end if;
  v_allowed := case v_job.status
    when 'dispatched' then p_status in ('en_route','canceled')
    when 'en_route' then p_status in ('arrived')
    when 'arrived' then p_status in ('in_progress')
    when 'in_progress' then p_status in ('completed')
    else false
  end;
  if not v_allowed then
    raise exception 'Invalid job status transition: % to %',v_job.status,p_status
      using errcode='check_violation';
  end if;
  perform set_config('servonas.assignment_sync','on',true);
  update public.jobs set
    status=p_status,
    actual_arrival_at=case when p_status='arrived' then now() else actual_arrival_at end,
    work_started_at=case when p_status='in_progress' then now() else work_started_at end,
    work_completed_at=case when p_status='completed' then now() else work_completed_at end,
    updated_by=auth.uid()
  where id=v_job.id;
  update public.technician_profiles set
    technician_status=case
      when p_status='en_route' then 'en_route'
      when p_status in ('arrived','in_progress') then 'on_site'
      when p_status='completed' then 'available'
      else technician_status
    end
  where id=v_job.assigned_technician_id
    and business_id=v_job.business_id
    and technician_status<>'off_duty';
  perform set_config('servonas.assignment_sync','off',true);
  return p_status;
end;
$$;
revoke all on function public.transition_assigned_job_status(uuid,text) from public;
grant execute on function public.transition_assigned_job_status(uuid,text) to authenticated;

create or replace function public.append_assigned_job_note(
  p_job_id uuid,
  p_note text
) returns void
language plpgsql security definer set search_path=public
as $$
declare
  v_business_id uuid;
begin
  if length(trim(coalesce(p_note,'')))<1 or length(p_note)>4000 then
    raise exception 'Note must contain between 1 and 4000 characters'
      using errcode='check_violation';
  end if;
  select business_id into v_business_id from public.jobs
  where id=p_job_id and is_deleted=false;
  if v_business_id is null or not public.is_assigned_technician(v_business_id,p_job_id) then
    raise exception 'Assigned job not found' using errcode='insufficient_privilege';
  end if;
  update public.jobs set
    internal_notes=concat_ws(E'\n\n',nullif(internal_notes,''),'[Technician '||to_char(now(),'YYYY-MM-DD HH24:MI TZ')||'] '||trim(p_note)),
    updated_by=auth.uid()
  where id=p_job_id and business_id=v_business_id;
end;
$$;
revoke all on function public.append_assigned_job_note(uuid,text) from public;
grant execute on function public.append_assigned_job_note(uuid,text) to authenticated;
