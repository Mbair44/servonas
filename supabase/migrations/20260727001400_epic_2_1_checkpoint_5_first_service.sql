begin;
alter table public.services add column recurring_allowed boolean not null default false,add column required_skills text[] not null default '{}';
alter table public.services add constraint services_required_skills_check check(cardinality(required_skills)<=20);
create or replace function public.create_onboarding_first_service(p_business_id uuid,p_name text,p_description text,p_duration_minutes integer,p_price_amount numeric,p_recurring_allowed boolean,p_required_skills text[],p_active boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_service_id uuid;
begin
 if not public.has_business_role(p_business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if length(btrim(p_name)) not between 2 and 150 or p_duration_minutes not between 15 and 1440 or p_price_amount<0 or cardinality(coalesce(p_required_skills,'{}'))>20 then raise exception 'Invalid service details' using errcode='22023';end if;
 if exists(select 1 from unnest(coalesce(p_required_skills,'{}')) skill where length(btrim(skill)) not between 1 and 100) then raise exception 'Invalid required skill' using errcode='22023';end if;
 insert into public.services(business_id,name,description,duration_minutes,price_amount,price_label,recurring_allowed,required_skills,active,created_by,updated_by)
 values(p_business_id,btrim(p_name),nullif(btrim(p_description),''),p_duration_minutes,p_price_amount,case when p_price_amount is null then 'quote' else 'fixed' end,coalesce(p_recurring_allowed,false),coalesce(p_required_skills,'{}'),coalesce(p_active,true),auth.uid(),auth.uid()) returning id into v_service_id;
 update public.business_onboarding_states set current_step=6,completed_steps=array(select distinct unnest(completed_steps||array['service'])),last_activity_at=now(),updated_at=now(),updated_by=auth.uid()
 where business_id=p_business_id and status in ('in_progress','reopened');
 if not found then raise exception 'Active onboarding state not found' using errcode='P0002';end if;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,step_key,status,metadata)
 values(p_business_id,'step_completed',auth.uid(),'service','in_progress',jsonb_build_object('service_id',v_service_id,'recurring_allowed',p_recurring_allowed,'required_skill_count',cardinality(coalesce(p_required_skills,'{}'))));
 return v_service_id;
end$$;
revoke all on function public.create_onboarding_first_service(uuid,text,text,integer,numeric,boolean,text[],boolean) from public;
grant execute on function public.create_onboarding_first_service(uuid,text,text,integer,numeric,boolean,text[],boolean) to authenticated;
comment on column public.services.required_skills is 'Optional business-defined service requirements. No industry taxonomy is enforced.';
commit;
