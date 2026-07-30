begin;

-- Production can have the technician access tables and note RPC without the
-- status-transition RPC when the original checkpoint migration was only
-- partially applied. Restore the API entry point idempotently.
create or replace function public.transition_assigned_job_status(
  p_job_id uuid,
  p_status text
) returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_job public.jobs%rowtype;
  v_allowed boolean;
begin
  select *
  into v_job
  from public.jobs
  where id=p_job_id
    and is_deleted=false
  for update;

  if v_job.id is null
    or not public.is_assigned_technician(v_job.business_id,v_job.id) then
    raise exception 'Assigned job not found'
      using errcode='insufficient_privilege';
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

  update public.jobs
  set status=p_status,
      actual_arrival_at=case
        when p_status='arrived' then now()
        else actual_arrival_at
      end,
      work_started_at=case
        when p_status='in_progress' then now()
        else work_started_at
      end,
      work_completed_at=case
        when p_status='completed' then now()
        else work_completed_at
      end,
      updated_by=auth.uid()
  where id=v_job.id;

  update public.technician_profiles
  set technician_status=case
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
end
$$;

revoke all on function public.transition_assigned_job_status(uuid,text) from public;
grant execute on function public.transition_assigned_job_status(uuid,text)
  to authenticated;

comment on function public.transition_assigned_job_status(uuid,text) is
  'Allows an authenticated active technician to advance only their assigned job through field-service statuses.';

commit;

-- Make the new RPC available immediately instead of waiting for PostgREST's
-- periodic schema-cache refresh.
notify pgrst, 'reload schema';
