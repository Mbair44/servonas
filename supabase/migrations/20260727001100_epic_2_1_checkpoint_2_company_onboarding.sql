begin;
alter table public.businesses
 add column if not exists display_name text,
 add column if not exists website_url text,
 add column if not exists address_line1 text,
 add column if not exists address_line2 text,
 add column if not exists city text,
 add column if not exists state text,
 add column if not exists postal_code text,
 add column if not exists country text not null default 'US',
 add column if not exists timezone text not null default 'America/Phoenix';
alter table public.businesses add constraint businesses_display_name_check check(display_name is null or length(btrim(display_name)) between 2 and 120);
create or replace function public.validate_business_timezone() returns trigger language plpgsql set search_path=public as $$
begin if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Invalid IANA time zone' using errcode='22023';end if;return new;end$$;
drop trigger if exists businesses_validate_timezone on public.businesses;
create trigger businesses_validate_timezone before insert or update of timezone on public.businesses for each row execute function public.validate_business_timezone();

create or replace function public.create_guided_business_workspace(
 p_name text,p_display_name text,p_slug text,p_email text,p_phone text,p_website_url text,p_address_line1 text,p_address_line2 text,
 p_city text,p_state text,p_postal_code text,p_country text,p_timezone text
) returns public.businesses language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_business public.businesses;v_entitlement public.business_entitlements;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501';end if;
 if length(btrim(p_name)) not between 2 and 200 or length(btrim(p_display_name)) not between 2 and 120 then raise exception 'Invalid company name' using errcode='22023';end if;
 if p_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid workspace slug' using errcode='22023';end if;
 if p_email!~*'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(btrim(p_phone))<7 then raise exception 'Invalid company contact information' using errcode='22023';end if;
 if nullif(p_website_url,'') is not null and p_website_url!~*'^https?://' then raise exception 'Invalid website URL' using errcode='22023';end if;
 if nullif(btrim(p_address_line1),'') is null or nullif(btrim(p_city),'') is null or nullif(btrim(p_state),'') is null or nullif(btrim(p_postal_code),'') is null then raise exception 'Complete company address required' using errcode='22023';end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid IANA time zone' using errcode='22023';end if;
 insert into public.businesses(name,display_name,slug,owner_user_id,business_model,email,phone,website_url,address_line1,address_line2,city,state,postal_code,country,timezone,primary_color,enabled_modules,onboarding_completed_at)
 values(btrim(p_name),btrim(p_display_name),lower(btrim(p_slug)),v_user,'services',lower(btrim(p_email)),btrim(p_phone),nullif(btrim(p_website_url),''),btrim(p_address_line1),nullif(btrim(p_address_line2),''),btrim(p_city),upper(btrim(p_state)),btrim(p_postal_code),upper(btrim(p_country)),p_timezone,'#2563eb','["booking","customers","team"]',null) returning * into v_business;
 insert into public.business_members(business_id,user_id,role) values(v_business.id,v_user,'owner');
 insert into public.business_onboarding_states(business_id,status,current_step,completed_steps,started_at,last_activity_at,updated_by)
 values(v_business.id,'in_progress',3,array['welcome','company'],now(),now(),v_user);
 insert into public.business_entitlements(business_id,entitlement_key,status,source,metadata,created_by,updated_by)
 values(v_business.id,'pilot','active','pilot',jsonb_build_object('provisioned_by','guided_onboarding'),v_user,v_user) returning * into v_entitlement;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,step_key,status,metadata)
 values(v_business.id,'step_completed',v_user,'company','in_progress',jsonb_build_object('completed_steps',array['welcome','company']));
 insert into public.business_entitlement_audit_events(business_id,entitlement_id,event_type,actor_user_id,entitlement_key,status,metadata)
 values(v_business.id,v_entitlement.id,'provisioned',v_user,'pilot','active',v_entitlement.metadata);
 return v_business;
end$$;
revoke all on function public.create_guided_business_workspace(text,text,text,text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.create_guided_business_workspace(text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
commit;
