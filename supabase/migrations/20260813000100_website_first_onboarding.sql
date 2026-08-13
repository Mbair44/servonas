begin;

create table if not exists public.business_website_onboarding_states(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 source text not null check(source in('pest-control-website','car-detailing-website')),
 current_step text not null default 'business' check(current_step in('business','style','preview','completed')),
 selected_services text[] not null default '{}',
 tagline text,
 preview_reached_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),updated_by uuid references auth.users(id),
 check(cardinality(selected_services)<=20),check(tagline is null or length(tagline)<=180)
);
alter table public.business_website_onboarding_states add column if not exists domain_preference text;
alter table public.business_website_onboarding_states add column if not exists domain_name text;
alter table public.business_website_onboarding_states drop constraint if exists business_website_onboarding_states_domain_preference_check;
alter table public.business_website_onboarding_states add constraint business_website_onboarding_states_domain_preference_check check(domain_preference is null or domain_preference in('existing_domain','need_domain'));
alter table public.business_website_onboarding_states drop constraint if exists business_website_onboarding_states_domain_name_check;
alter table public.business_website_onboarding_states add constraint business_website_onboarding_states_domain_name_check check(domain_name is null or length(domain_name) between 3 and 253);
alter table public.business_website_onboarding_states enable row level security;
alter table public.business_website_onboarding_states drop constraint if exists business_website_onboarding_states_source_check;
alter table public.business_website_onboarding_states add constraint business_website_onboarding_states_source_check check(source in('pest-control-website','car-detailing-website'));
drop policy if exists "members read website onboarding" on public.business_website_onboarding_states;
create policy "members read website onboarding" on public.business_website_onboarding_states for select to authenticated using(public.is_business_member(business_id));
drop policy if exists "admins manage website onboarding" on public.business_website_onboarding_states;
create policy "admins manage website onboarding" on public.business_website_onboarding_states for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));

create or replace function public.create_website_first_workspace(p_name text,p_slug text,p_email text,p_phone text,p_city text,p_state text,p_service_area text,p_description text,p_services text[],p_source text,p_service_model text,p_domain_preference text,p_domain_name text)
returns public.businesses language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_business public.businesses;v_entitlement public.business_entitlements;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_source not in('pest-control-website','car-detailing-website') then raise exception 'Invalid acquisition source' using errcode='22023';end if;
 if p_source='car-detailing-website' and coalesce(p_service_model,'mobile') not in('mobile','shop','both') then raise exception 'Invalid detailing setup' using errcode='22023';end if;
 if p_domain_preference not in('existing_domain','need_domain') or (p_domain_preference='existing_domain' and (p_domain_name is null or p_domain_name!~'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:[.][a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$')) then raise exception 'Invalid domain preference' using errcode='22023';end if;
 if length(btrim(p_name)) not between 2 and 120 or p_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid business identity' using errcode='22023';end if;
 if p_email!~*'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(btrim(p_phone))<7 or nullif(btrim(p_city),'') is null or nullif(btrim(p_state),'') is null then raise exception 'Invalid business details' using errcode='22023';end if;
 if cardinality(coalesce(p_services,'{}')) not between 1 and 20 or exists(select 1 from unnest(coalesce(p_services,'{}')) service where length(btrim(service)) not between 2 and 150) then raise exception 'Invalid services' using errcode='22023';end if;
 if length(coalesce(p_service_area,''))>150 or length(coalesce(p_description,''))>500 then raise exception 'Website details are too long' using errcode='22023';end if;
 insert into public.businesses(name,display_name,slug,owner_user_id,business_model,email,phone,city,state,country,timezone,primary_color,enabled_modules,industry_profile,industry_other,operating_model,onboarding_defaults,onboarding_completed_at)
 values(btrim(p_name),btrim(p_name),lower(btrim(p_slug)),v_user,'services',lower(btrim(p_email)),btrim(p_phone),btrim(p_city),upper(btrim(p_state)),'US','America/Phoenix',case when p_source='car-detailing-website' then '#1677ff' else '#1769f5' end,'["booking","customers","team"]',case when p_source='car-detailing-website' then 'other' else 'pest_control' end,case when p_source='car-detailing-website' then 'car_detailing' else null end,'appointment_service',case when p_source='car-detailing-website' then jsonb_build_object('service_model',coalesce(p_service_model,'mobile')) else '{}'::jsonb end,null) returning * into v_business;
 insert into public.business_members(business_id,user_id,role) values(v_business.id,v_user,'owner');
 insert into public.business_onboarding_states(business_id,status,current_step,completed_steps,started_at,last_activity_at,updated_by) values(v_business.id,'in_progress',4,array['welcome','company','profile'],now(),now(),v_user);
 insert into public.business_entitlements(business_id,entitlement_key,status,source,metadata,created_by,updated_by) values(v_business.id,'pilot','active','pilot',jsonb_build_object('provisioned_by','website_first_onboarding'),v_user,v_user) returning * into v_entitlement;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,step_key,status,metadata) values(v_business.id,'step_completed',v_user,'profile','in_progress',jsonb_build_object('source',p_source,'completed_steps',array['welcome','company','profile']));
 insert into public.business_entitlement_audit_events(business_id,entitlement_id,event_type,actor_user_id,entitlement_key,status,metadata) values(v_business.id,v_entitlement.id,'provisioned',v_user,'pilot','active',v_entitlement.metadata);
 insert into public.business_website_onboarding_states(business_id,source,current_step,selected_services,domain_preference,domain_name,updated_by) values(v_business.id,p_source,'style',coalesce(p_services,'{}'),p_domain_preference,case when p_domain_preference='existing_domain' then lower(p_domain_name) else null end,v_user);
 insert into public.business_website_settings(business_id,public_slug,status,template_key,primary_color,secondary_color,hero_heading,hero_subheading,about_text,request_service_enabled,booking_enabled,updated_by)
 values(v_business.id,v_business.slug,'draft','modern',case when p_source='car-detailing-website' then '#1677ff' else '#1769f5' end,case when p_source='car-detailing-website' then '#111827' else '#0b1733' end,case when p_source='car-detailing-website' then 'Your Car Deserves More Than a Wash' else 'Protect Your Home From Unwanted Guests' end,coalesce(nullif(btrim(p_description),''),case when p_source='car-detailing-website' then 'Professional detailing, paint correction, and ceramic protection that makes every vehicle look its best.' else 'Reliable local pest control with clear communication and convenient service.' end),coalesce(nullif(btrim(p_description),''),v_business.name||case when p_source='car-detailing-website' then ' provides meticulous vehicle care, straightforward packages, and convenient scheduling.' else ' provides dependable local pest-control service and a straightforward customer experience.' end),true,false,v_user);
 insert into public.services(business_id,name,description,duration_minutes,price_amount,price_label,recurring_allowed,required_skills,active,created_by,updated_by)
 select v_business.id,btrim(service),'Professional '||lower(btrim(service))||' from '||v_business.name||'.',60,null,'quote',true,'{}',true,v_user,v_user from unnest(coalesce(p_services,'{}')) service where length(btrim(service)) between 2 and 150;
 if nullif(btrim(p_service_area),'') is not null then insert into public.workforce_territories(business_id,name,territory_type,postal_codes,neighborhoods,is_active,created_by,updated_by) values(v_business.id,btrim(p_service_area),'mixed','{}','{}',true,v_user,v_user);end if;
 return v_business;
end$$;
drop function if exists public.create_website_first_workspace(text,text,text,text,text,text,text,text,text[]);
drop function if exists public.create_website_first_workspace(text,text,text,text,text,text,text,text,text[],text,text);
revoke all on function public.create_website_first_workspace(text,text,text,text,text,text,text,text,text[],text,text,text,text) from public;
grant execute on function public.create_website_first_workspace(text,text,text,text,text,text,text,text,text[],text,text,text,text) to authenticated;
notify pgrst,'reload schema';commit;
