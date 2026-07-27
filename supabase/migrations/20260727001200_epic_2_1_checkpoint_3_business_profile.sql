begin;
alter table public.businesses
 add column operating_model text not null default 'appointment_service',
 add column industry_profile text,
 add column industry_other text,
 add column onboarding_defaults jsonb not null default '{}',
 add constraint businesses_operating_model_check check(operating_model in ('route_service','appointment_service','rental_inventory','project_service')),
 add constraint businesses_industry_profile_check check(industry_profile is null or industry_profile in ('pest_control','lawn_care','pool_service','hvac','plumbing','electrical','party_rental','equipment_rental','other')),
 add constraint businesses_industry_other_check check(industry_profile<>'other' or length(btrim(industry_other)) between 2 and 100),
 add constraint businesses_onboarding_defaults_check check(jsonb_typeof(onboarding_defaults)='object');

create or replace function public.save_onboarding_business_profile(p_business_id uuid,p_operating_model text,p_industry_profile text,p_industry_other text)
returns void language plpgsql security definer set search_path=public as $$
declare v_legacy_model text;v_defaults jsonb;
begin
 if not public.has_business_role(p_business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if p_operating_model not in ('route_service','appointment_service','rental_inventory','project_service') then raise exception 'Invalid operating model' using errcode='22023';end if;
 if p_industry_profile not in ('pest_control','lawn_care','pool_service','hvac','plumbing','electrical','party_rental','equipment_rental','other') then raise exception 'Invalid industry profile' using errcode='22023';end if;
 if p_industry_profile='other' and length(btrim(coalesce(p_industry_other,''))) not between 2 and 100 then raise exception 'Other industry is required' using errcode='22023';end if;
 v_legacy_model:=case p_operating_model when 'rental_inventory' then 'rentals' when 'appointment_service' then 'appointments' else 'services' end;
 v_defaults:=case p_industry_profile
  when 'pest_control' then '{"service_name":"General pest service","duration_minutes":60,"recurring_allowed":true}'::jsonb
  when 'lawn_care' then '{"service_name":"Lawn maintenance","duration_minutes":60,"recurring_allowed":true}'::jsonb
  when 'pool_service' then '{"service_name":"Pool service","duration_minutes":45,"recurring_allowed":true}'::jsonb
  when 'hvac' then '{"service_name":"HVAC service call","duration_minutes":90,"recurring_allowed":false}'::jsonb
  when 'plumbing' then '{"service_name":"Plumbing service call","duration_minutes":90,"recurring_allowed":false}'::jsonb
  when 'electrical' then '{"service_name":"Electrical service call","duration_minutes":90,"recurring_allowed":false}'::jsonb
  when 'party_rental' then '{"service_name":"Event rental","duration_minutes":60,"recurring_allowed":false}'::jsonb
  when 'equipment_rental' then '{"service_name":"Equipment rental","duration_minutes":60,"recurring_allowed":false}'::jsonb
  else '{"service_name":"Service call","duration_minutes":60,"recurring_allowed":false}'::jsonb end;
 update public.businesses set operating_model=p_operating_model,industry_profile=p_industry_profile,industry_other=case when p_industry_profile='other' then btrim(p_industry_other) else null end,
  onboarding_defaults=v_defaults,business_model=v_legacy_model,updated_at=now() where id=p_business_id;
 update public.business_onboarding_states set status='in_progress',current_step=4,completed_steps=array(select distinct unnest(completed_steps||array['profile'])),
  last_activity_at=now(),updated_at=now(),updated_by=auth.uid() where business_id=p_business_id and status in ('in_progress','reopened');
 if not found then raise exception 'Active onboarding state not found' using errcode='P0002';end if;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,step_key,status,metadata)
 values(p_business_id,'step_completed',auth.uid(),'profile','in_progress',jsonb_build_object('operating_model',p_operating_model,'industry_profile',p_industry_profile,'defaults_are_suggestions',true));
end$$;
revoke all on function public.save_onboarding_business_profile(uuid,text,text,text) from public;
grant execute on function public.save_onboarding_business_profile(uuid,text,text,text) to authenticated;
comment on column public.businesses.industry_profile is 'Industry influences editable onboarding suggestions only and never restricts platform capability.';
commit;
