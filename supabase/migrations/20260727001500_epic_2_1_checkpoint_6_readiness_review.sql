begin;
create or replace function public.complete_guided_onboarding(p_business_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_business public.businesses%rowtype;
begin
 if not public.has_business_role(p_business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 select * into v_business from public.businesses where id=p_business_id for update;
 if v_business.id is null or nullif(btrim(v_business.name),'') is null or nullif(btrim(v_business.display_name),'') is null or
  nullif(btrim(v_business.email),'') is null or nullif(btrim(v_business.phone),'') is null or nullif(btrim(v_business.address_line1),'') is null or
  v_business.industry_profile is null or v_business.operating_model is null then raise exception 'Company or business profile is incomplete' using errcode='22023';end if;
 if not exists(select 1 from public.booking_availability where business_id=p_business_id and active) then raise exception 'Business hours are incomplete' using errcode='22023';end if;
 if not exists(select 1 from public.services where business_id=p_business_id and not is_deleted) then raise exception 'First service is incomplete' using errcode='22023';end if;
 if not exists(select 1 from public.business_entitlements where business_id=p_business_id and entitlement_key in('pilot','starter','growth','business','enterprise') and status in('active','grace_period') and starts_at<=now() and (ends_at is null or ends_at>now() or(grace_period_ends_at is not null and grace_period_ends_at>now()))) then raise exception 'Servonas access is inactive' using errcode='42501';end if;
 update public.business_onboarding_states set status='completed',current_step=6,completed_steps=array['welcome','company','profile','hours','service','readiness'],
  completed_at=now(),last_activity_at=now(),updated_at=now(),updated_by=auth.uid() where business_id=p_business_id and status in ('in_progress','reopened');
 if not found then raise exception 'Active onboarding state not found' using errcode='P0002';end if;
 update public.businesses set onboarding_completed_at=now(),updated_at=now() where id=p_business_id;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,step_key,status,metadata)
 values(p_business_id,'completed',auth.uid(),'readiness','completed',jsonb_build_object('pilot_access_active',true,'employee_import_blocking',false,'customer_import_blocking',false));
end$$;
create or replace function public.reopen_guided_onboarding(p_business_id uuid,p_current_step integer default 6)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_business_role(p_business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if p_current_step not between 2 and 6 then raise exception 'Invalid onboarding step' using errcode='22023';end if;
 update public.business_onboarding_states set status='reopened',current_step=p_current_step,completed_at=null,last_activity_at=now(),updated_at=now(),updated_by=auth.uid() where business_id=p_business_id and status='completed';
 if not found then raise exception 'Completed onboarding state not found' using errcode='P0002';end if;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,status,metadata) values(p_business_id,'reopened',auth.uid(),'reopened',jsonb_build_object('current_step',p_current_step));
end$$;
revoke all on function public.complete_guided_onboarding(uuid) from public;revoke all on function public.reopen_guided_onboarding(uuid,integer) from public;
grant execute on function public.complete_guided_onboarding(uuid) to authenticated;grant execute on function public.reopen_guided_onboarding(uuid,integer) to authenticated;
comment on function public.complete_guided_onboarding(uuid) is 'Completes onboarding only after tenant-scoped source records and active Pilot access pass readiness verification.';
commit;
