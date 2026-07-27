begin;
create or replace function public.save_onboarding_business_hours(p_business_id uuid,p_hours jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_count integer;v_open_count integer;
begin
 if not public.has_business_role(p_business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if jsonb_typeof(p_hours)<>'array' then raise exception 'Hours must be an array' using errcode='22023';end if;
 select count(distinct (item->>'weekday')::integer),count(*) filter(where (item->>'open')::boolean) into v_count,v_open_count from jsonb_array_elements(p_hours) item
 where (item->>'weekday')::integer between 0 and 6;
 if v_count<>7 or v_open_count<1 then raise exception 'Seven days and at least one open day are required' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_hours) item where (item->>'open')::boolean and
  ((item->>'start')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (item->>'end')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (item->>'end')::time<=(item->>'start')::time))
  then raise exception 'Invalid business-hour range' using errcode='22023';end if;
 delete from public.booking_availability where business_id=p_business_id;
 insert into public.booking_availability(business_id,weekday,start_time,end_time,active)
 select p_business_id,(item->>'weekday')::smallint,(item->>'start')::time,(item->>'end')::time,true from jsonb_array_elements(p_hours) item where (item->>'open')::boolean;
 update public.business_onboarding_states set current_step=5,completed_steps=array(select distinct unnest(completed_steps||array['hours'])),last_activity_at=now(),updated_at=now(),updated_by=auth.uid()
 where business_id=p_business_id and status in ('in_progress','reopened');
 if not found then raise exception 'Active onboarding state not found' using errcode='P0002';end if;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,step_key,status,metadata)
 values(p_business_id,'step_completed',auth.uid(),'hours','in_progress',jsonb_build_object('open_days',v_open_count,'timezone',(select timezone from public.businesses where id=p_business_id)));
end$$;
revoke all on function public.save_onboarding_business_hours(uuid,jsonb) from public;
grant execute on function public.save_onboarding_business_hours(uuid,jsonb) to authenticated;
comment on function public.save_onboarding_business_hours(uuid,jsonb) is 'Atomically replaces the existing public-booking availability schedule and advances onboarding after validated work.';
commit;
