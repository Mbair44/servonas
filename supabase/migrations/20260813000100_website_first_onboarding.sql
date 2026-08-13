begin;

create table if not exists public.business_website_onboarding_states(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 source text not null check(source in('pest-control-website')),
 current_step text not null default 'business' check(current_step in('business','style','preview','completed')),
 selected_services text[] not null default '{}',
 tagline text,
 preview_reached_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),updated_by uuid references auth.users(id),
 check(cardinality(selected_services)<=20),check(tagline is null or length(tagline)<=180)
);
alter table public.business_website_onboarding_states enable row level security;
create policy "members read website onboarding" on public.business_website_onboarding_states for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage website onboarding" on public.business_website_onboarding_states for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));

create or replace function public.create_website_first_workspace(p_name text,p_slug text,p_email text,p_phone text,p_city text,p_state text,p_service_area text,p_description text,p_services text[])
returns public.businesses language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_business public.businesses;v_entitlement public.business_entitlements;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501';end if;
 if length(btrim(p_name)) not between 2 and 120 or p_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid business identity' using errcode='22023';end if;
 if p_email!~*'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(btrim(p_phone))<7 or nullif(btrim(p_city),'') is null or nullif(btrim(p_state),'') is null then raise exception 'Invalid business details' using errcode='22023';end if;
 if cardinality(coalesce(p_services,'{}')) not between 1 and 20 or exists(select 1 from unnest(coalesce(p_services,'{}')) service where length(btrim(service)) not between 2 and 150) then raise exception 'Invalid services' using errcode='22023';end if;
 if length(coalesce(p_service_area,''))>150 or length(coalesce(p_description,''))>500 then raise exception 'Website details are too long' using errcode='22023';end if;
 insert into public.businesses(name,display_name,slug,owner_user_id,business_model,email,phone,city,state,country,timezone,primary_color,enabled_modules,industry_profile,operating_model,onboarding_completed_at)
 values(btrim(p_name),btrim(p_name),lower(btrim(p_slug)),v_user,'services',lower(btrim(p_email)),btrim(p_phone),btrim(p_city),upper(btrim(p_state)),'US','America/Phoenix','#1769f5','["booking","customers","team"]','pest_control','appointment_service',null) returning * into v_business;
 insert into public.business_members(business_id,user_id,role) values(v_business.id,v_user,'owner');
 insert into public.business_onboarding_states(business_id,status,current_step,completed_steps,started_at,last_activity_at,updated_by) values(v_business.id,'in_progress',4,array['welcome','company','profile'],now(),now(),v_user);
 insert into public.business_entitlements(business_id,entitlement_key,status,source,metadata,created_by,updated_by) values(v_business.id,'pilot','active','pilot',jsonb_build_object('provisioned_by','website_first_onboarding'),v_user,v_user) returning * into v_entitlement;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,step_key,status,metadata) values(v_business.id,'step_completed',v_user,'profile','in_progress',jsonb_build_object('source','pest-control-website','completed_steps',array['welcome','company','profile']));
 insert into public.business_entitlement_audit_events(business_id,entitlement_id,event_type,actor_user_id,entitlement_key,status,metadata) values(v_business.id,v_entitlement.id,'provisioned',v_user,'pilot','active',v_entitlement.metadata);
 insert into public.business_website_onboarding_states(business_id,source,current_step,selected_services,updated_by) values(v_business.id,'pest-control-website','style',coalesce(p_services,'{}'),v_user);
 insert into public.business_website_settings(business_id,public_slug,status,template_key,primary_color,secondary_color,hero_heading,hero_subheading,about_text,request_service_enabled,booking_enabled,updated_by)
 values(v_business.id,v_business.slug,'draft','modern','#1769f5','#0b1733','Protect Your Home From Unwanted Guests',coalesce(nullif(btrim(p_description),''),'Reliable local pest control with clear communication and convenient service.'),coalesce(nullif(btrim(p_description),''),v_business.name||' provides dependable local pest-control service and a straightforward customer experience.'),true,false,v_user);
 insert into public.services(business_id,name,description,duration_minutes,price_amount,price_label,recurring_allowed,required_skills,active,created_by,updated_by)
 select v_business.id,btrim(service),'Professional '||lower(btrim(service))||' from '||v_business.name||'.',60,null,'quote',true,'{}',true,v_user,v_user from unnest(coalesce(p_services,'{}')) service where length(btrim(service)) between 2 and 150;
 if nullif(btrim(p_service_area),'') is not null then insert into public.workforce_territories(business_id,name,territory_type,postal_codes,neighborhoods,is_active,created_by,updated_by) values(v_business.id,btrim(p_service_area),'mixed','{}','{}',true,v_user,v_user);end if;
 return v_business;
end$$;
revoke all on function public.create_website_first_workspace(text,text,text,text,text,text,text,text,text[]) from public;
grant execute on function public.create_website_first_workspace(text,text,text,text,text,text,text,text,text[]) to authenticated;
notify pgrst,'reload schema';commit;
