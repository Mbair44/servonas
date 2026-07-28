-- Epic 2.4 Checkpoints 9, 10, 19, and 21: narrow internal lifecycle commands.
create or replace function public.is_servonas_platform_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(auth.jwt()->>'email','') ~* '^[^@\s]+@servonas[.]com$'
    and ((auth.jwt()->>'email_confirmed_at') is not null
      or coalesce((auth.jwt()->>'email_verified')::boolean,false));
$$;
revoke all on function public.is_servonas_platform_admin() from public;
grant execute on function public.is_servonas_platform_admin() to authenticated;

create or replace function public.manage_business_entitlement(
  p_business_id uuid,
  p_entitlement_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text,
  p_ends_at timestamptz default null
) returns public.business_entitlements
language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid := auth.uid();
  v_current public.business_entitlements;
  v_previous_status text;
  v_next_status text;
  v_event text;
begin
  if not public.is_servonas_platform_admin() then
    raise exception 'Platform administrator access required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'A useful administrative reason is required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,24));
  select * into v_current from public.business_entitlements
   where id=p_entitlement_id and business_id=p_business_id for update;
  if v_current.id is null then raise exception 'Entitlement not found' using errcode='P0002'; end if;
  if v_current.version<>p_expected_version then
    raise exception 'Entitlement changed; refresh before retrying' using errcode='40001';
  end if;
  v_previous_status:=v_current.status;
  case p_action
    when 'suspend' then
      if v_current.status not in('active','grace_period') then raise exception 'Invalid suspension transition' using errcode='22023';end if;
      v_next_status:='suspended';v_event:='entitlement_suspended';
      update public.business_entitlements set status=v_next_status,suspended_at=now(),suspended_by=v_actor,
       suspension_reason=btrim(p_reason),version=version+1,updated_at=now(),updated_by=v_actor where id=v_current.id returning * into v_current;
    when 'restore' then
      if v_current.status not in('suspended','expired','grace_period') then raise exception 'Invalid restore transition' using errcode='22023';end if;
      v_next_status:='active';v_event:='entitlement_restored';
      update public.business_entitlements set status=v_next_status,suspended_at=null,suspended_by=null,suspension_reason=null,
       ends_at=case when ends_at is not null and ends_at<=now() then null else ends_at end,
       version=version+1,updated_at=now(),updated_by=v_actor where id=v_current.id returning * into v_current;
    when 'cancel' then
      if v_current.status not in('scheduled','active','grace_period','suspended') then raise exception 'Invalid cancellation transition' using errcode='22023';end if;
      v_next_status:='canceled';v_event:='entitlement_canceled';
      update public.business_entitlements set status=v_next_status,canceled_at=now(),canceled_by=v_actor,
       cancellation_reason=btrim(p_reason),version=version+1,updated_at=now(),updated_by=v_actor where id=v_current.id returning * into v_current;
    when 'change_end_date' then
      if v_current.status not in('scheduled','active','grace_period','suspended','expired') then raise exception 'Invalid date-change transition' using errcode='22023';end if;
      if p_ends_at is not null and p_ends_at<=v_current.starts_at then raise exception 'End date must be after start date' using errcode='22023';end if;
      v_next_status:=case when v_current.status='expired' and (p_ends_at is null or p_ends_at>now()) then 'active' else v_current.status end;
      v_event:=case when p_ends_at is null or v_current.ends_at is null or p_ends_at>v_current.ends_at then 'entitlement_extended' else 'entitlement_shortened' end;
      update public.business_entitlements set status=v_next_status,ends_at=p_ends_at,version=version+1,
       updated_at=now(),updated_by=v_actor where id=v_current.id returning * into v_current;
    else raise exception 'Unsupported entitlement action' using errcode='22023';
  end case;
  insert into public.business_entitlement_audit_events(
    business_id,entitlement_id,event_type,actor_user_id,entitlement_key,status,metadata
  ) values(
    p_business_id,v_current.id,v_event,v_actor,v_current.entitlement_key,v_current.status,
    jsonb_build_object('previous_status',v_previous_status,'new_status',v_current.status,
      'reason',btrim(p_reason),'previous_version',p_expected_version,'new_version',v_current.version,
      'ends_at',v_current.ends_at,'source','internal_admin')
  );
  return v_current;
end$$;
revoke all on function public.manage_business_entitlement(uuid,uuid,integer,text,text,timestamptz) from public;
grant execute on function public.manage_business_entitlement(uuid,uuid,integer,text,text,timestamptz) to authenticated;

comment on function public.manage_business_entitlement(uuid,uuid,integer,text,text,timestamptz) is
  'Narrow, audited entitlement lifecycle command restricted to confirmed Servonas platform administrators.';

create or replace function public.grant_pilot_entitlement_admin(p_business_id uuid,p_reason text)
returns public.business_entitlements language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_entitlement public.business_entitlements;
begin
 if not public.is_servonas_platform_admin() then raise exception 'Platform administrator access required' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'A useful administrative reason is required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,24));
 if not exists(select 1 from public.businesses where id=p_business_id and is_deleted=false) then raise exception 'Business not found' using errcode='P0002';end if;
 if exists(select 1 from public.business_entitlements where business_id=p_business_id and status in('scheduled','active','grace_period')) then raise exception 'Business already has current access' using errcode='23505';end if;
 insert into public.business_entitlements(business_id,entitlement_key,status,source,metadata,created_by,updated_by)
 values(p_business_id,'pilot','active','manual',jsonb_build_object('administrative_reason',btrim(p_reason)),v_actor,v_actor)returning * into v_entitlement;
 insert into public.business_entitlement_audit_events(business_id,entitlement_id,event_type,actor_user_id,entitlement_key,status,metadata)
 values(p_business_id,v_entitlement.id,'pilot_entitlement_granted',v_actor,'pilot','active',jsonb_build_object('source','internal_admin','reason',btrim(p_reason)));
 return v_entitlement;
end$$;
revoke all on function public.grant_pilot_entitlement_admin(uuid,text) from public;
grant execute on function public.grant_pilot_entitlement_admin(uuid,text) to authenticated;
