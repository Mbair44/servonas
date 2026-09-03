begin;

alter table public.business_website_onboarding_states
 drop constraint if exists business_website_onboarding_states_source_check;
alter table public.business_website_onboarding_states
 add constraint business_website_onboarding_states_source_check
 check(source in('pest-control-website','car-detailing-website','hvac-website','plumbing-website','landscaping-website','cleaning-website','powerwashing-website','junk-removal-website','christmas-lights-website','floral-event-website','event-party-rentals-website'));

alter table public.website_builder_drafts
  drop constraint if exists website_builder_drafts_source_check;
alter table public.website_builder_drafts
  add constraint website_builder_drafts_source_check check (
    source in (
      'pest-control-website','car-detailing-website','hvac-website','plumbing-website','landscaping-website','cleaning-website','powerwashing-website','junk-removal-website','christmas-lights-website','floral-event-website','event-party-rentals-website'
    )
  );

create or replace function public.create_website_first_workspace(p_name text,p_slug text,p_email text,p_phone text,p_city text,p_state text,p_service_area text,p_description text,p_services text[],p_source text,p_service_model text,p_domain_preference text,p_domain_name text)
returns public.businesses language plpgsql security definer set search_path=public as $$
declare
 v_user uuid:=auth.uid();v_business public.businesses;v_entitlement public.business_entitlements;
 v_primary text;v_secondary text;v_hero text;v_subheading text;v_about_suffix text;v_industry text;v_industry_other text;v_defaults jsonb:='{}'::jsonb;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_source not in('pest-control-website','car-detailing-website','hvac-website','plumbing-website','landscaping-website','cleaning-website','powerwashing-website','junk-removal-website','christmas-lights-website','floral-event-website','event-party-rentals-website') then raise exception 'Invalid acquisition source' using errcode='22023';end if;
 if p_source='car-detailing-website' and coalesce(p_service_model,'mobile') not in('mobile','shop','both') then raise exception 'Invalid detailing setup' using errcode='22023';end if;
 if p_domain_preference not in('existing_domain','need_domain') or (p_domain_preference='existing_domain' and (p_domain_name is null or p_domain_name!~'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:[.][a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$')) then raise exception 'Invalid domain preference' using errcode='22023';end if;
 if length(btrim(p_name)) not between 2 and 120 or p_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid business identity' using errcode='22023';end if;
 if p_email!~*'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(btrim(p_phone))<7 or nullif(btrim(p_city),'') is null or nullif(btrim(p_state),'') is null then raise exception 'Invalid business details' using errcode='22023';end if;
 if cardinality(coalesce(p_services,'{}')) not between 1 and 20 or exists(select 1 from unnest(coalesce(p_services,'{}')) service where length(btrim(service)) not between 2 and 150) then raise exception 'Invalid services' using errcode='22023';end if;
 if length(coalesce(p_service_area,''))>150 or length(coalesce(p_description,''))>500 then raise exception 'Website details are too long' using errcode='22023';end if;

 select x.primary_color,x.secondary_color,x.hero,x.subheading,x.about_suffix,x.industry,x.industry_other into v_primary,v_secondary,v_hero,v_subheading,v_about_suffix,v_industry,v_industry_other from (values
  ('pest-control-website','#1769f5','#0b1733','Protect Your Home From Unwanted Guests','Reliable local pest control with clear communication and convenient service.',' provides dependable local pest-control service and a straightforward customer experience.','pest_control',null),
  ('car-detailing-website','#1677ff','#111827','Your Car Deserves More Than a Wash','Professional detailing, paint correction, and ceramic protection that makes every vehicle look its best.',' provides meticulous vehicle care, straightforward packages, and convenient scheduling.','other','car_detailing'),
  ('hvac-website','#1677ff','#10233f','Comfort You Can Count On, Every Season','Reliable local heating and cooling service with responsive scheduling and clear communication.',' provides dependable heating, cooling, and indoor-air service for local homes and businesses.','hvac',null),
  ('plumbing-website','#0878d1','#0b2844','Local Plumbing Help, Right When You Need It','Professional plumbing service for repairs, installations, drains, water heaters, and urgent problems.',' provides responsive local plumbing service, straightforward recommendations, and dependable workmanship.','plumbing',null),
  ('landscaping-website','#25824b','#173b2a','Outdoor Spaces Made Beautiful','Dependable local landscaping, lawn care, cleanups, irrigation, and outdoor improvements.',' creates and maintains attractive outdoor spaces with dependable scheduling and thoughtful service.','lawn_care',null),
  ('cleaning-website','#1597a5','#123c4a','A Cleaner Space, Without the Stress','Reliable home and commercial cleaning with simple scheduling and service you can trust.',' provides careful, dependable cleaning for local homes and businesses with convenient scheduling.','other','cleaning'),
  ('powerwashing-website','#0f8ec7','#12324a','A Cleaner Property Starts Outside','Professional power washing and exterior cleaning that helps homes and businesses look their best.',' delivers dependable exterior cleaning, clear communication, and straightforward scheduling for local properties.','other','power_washing'),
  ('junk-removal-website','#c65a12','#1f2937','Got Junk? We’ll Make It Disappear.','Furniture, appliances, yard debris, garage cleanouts, and more. Tell us what needs to go and we’ll take care of the heavy lifting.',' helps homeowners and businesses clear out unwanted items with fast response, upfront estimates, and dependable local service.','junk_removal',null),
  ('christmas-lights-website','#c62828','#113a5c','Professional Christmas Light Installation Without the Hassle','We design, install, maintain, and remove your Christmas lights so you can enjoy the season without climbing a ladder.',' creates polished holiday lighting displays for homes and commercial properties with design help, professional installation, in-season maintenance, and organized takedown after the season.','other','christmas_light_installation'),
  ('floral-event-website','#a64d79','#3f2936','Thoughtfully Designed for Life’s Beautiful Moments','Custom flowers and event styling created with care for weddings, celebrations, and meaningful gatherings.',' creates thoughtful floral designs and memorable event experiences with personal service from consultation through setup.','other','floral_event'),
  ('event-party-rentals-website','#e46a2c','#1f2a44','Inventory, Availability, and Event Bookings in One Place','Professional event-rental websites with availability-first browsing, customer-friendly booking, and organized delivery workflows.',' helps customers browse inventory, check dates, and plan events while your team stays organized behind the scenes.','party_rental',null)
 ) as x(source,primary_color,secondary_color,hero,subheading,about_suffix,industry,industry_other) where x.source=p_source;
 if p_source='car-detailing-website' then v_defaults=jsonb_build_object('service_model',coalesce(p_service_model,'mobile'));end if;

 insert into public.businesses(name,display_name,slug,owner_user_id,business_model,email,phone,city,state,country,timezone,primary_color,enabled_modules,industry_profile,industry_other,operating_model,onboarding_defaults,onboarding_completed_at)
 values(btrim(p_name),btrim(p_name),lower(btrim(p_slug)),v_user,'services',lower(btrim(p_email)),btrim(p_phone),btrim(p_city),upper(btrim(p_state)),'US','America/Phoenix',v_primary,'["booking","customers","team"]',v_industry,v_industry_other,'appointment_service',v_defaults,null) returning * into v_business;
 insert into public.business_members(business_id,user_id,role) values(v_business.id,v_user,'owner');
 insert into public.business_onboarding_states(business_id,status,current_step,completed_steps,started_at,last_activity_at,updated_by) values(v_business.id,'in_progress',4,array['welcome','company','profile'],now(),now(),v_user);
 insert into public.business_entitlements(business_id,entitlement_key,status,source,metadata,created_by,updated_by) values(v_business.id,'pilot','active','pilot',jsonb_build_object('provisioned_by','website_first_onboarding'),v_user,v_user) returning * into v_entitlement;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,step_key,status,metadata) values(v_business.id,'step_completed',v_user,'profile','in_progress',jsonb_build_object('source',p_source,'completed_steps',array['welcome','company','profile']));
 insert into public.business_entitlement_audit_events(business_id,entitlement_id,event_type,actor_user_id,entitlement_key,status,metadata) values(v_business.id,v_entitlement.id,'provisioned',v_user,'pilot','active',v_entitlement.metadata);
 insert into public.business_website_onboarding_states(business_id,source,current_step,selected_services,domain_preference,domain_name,updated_by) values(v_business.id,p_source,'style',coalesce(p_services,'{}'),p_domain_preference,case when p_domain_preference='existing_domain' then lower(p_domain_name) else null end,v_user);
 insert into public.business_website_settings(business_id,public_slug,status,template_key,primary_color,secondary_color,hero_heading,hero_subheading,about_text,request_service_enabled,booking_enabled,updated_by)
 values(v_business.id,v_business.slug,'draft','modern',v_primary,v_secondary,v_hero,coalesce(nullif(btrim(p_description),''),v_subheading),coalesce(nullif(btrim(p_description),''),v_business.name||v_about_suffix),true,false,v_user);
 insert into public.services(business_id,name,description,duration_minutes,price_amount,price_label,recurring_allowed,required_skills,active,created_by,updated_by)
 select v_business.id,btrim(service),'Professional '||lower(btrim(service))||' from '||v_business.name||'.',60,null,'quote',true,'{}',true,v_user,v_user from unnest(coalesce(p_services,'{}')) service where length(btrim(service)) between 2 and 150;
 if nullif(btrim(p_service_area),'') is not null then insert into public.workforce_territories(business_id,name,territory_type,postal_codes,neighborhoods,is_active,created_by,updated_by) values(v_business.id,btrim(p_service_area),'mixed','{}','{}',true,v_user,v_user);end if;
 return v_business;
end$$;

create or replace function public.create_anonymous_website_first_workspace(
  p_name text,p_slug text,p_email text,p_phone text,p_city text,p_state text,p_service_area text,p_description text,p_services text[],p_source text,p_service_model text,p_domain_preference text,p_domain_name text
)
returns public.businesses language plpgsql security definer set search_path=public as $$
declare
 v_business public.businesses;v_entitlement public.business_entitlements;v_primary text;v_secondary text;v_hero text;v_subheading text;v_about_suffix text;v_industry text;v_industry_other text;v_defaults jsonb:='{}'::jsonb;
begin
 if p_source not in('pest-control-website','car-detailing-website','hvac-website','plumbing-website','landscaping-website','cleaning-website','powerwashing-website','junk-removal-website','christmas-lights-website','floral-event-website','event-party-rentals-website') then raise exception 'Invalid acquisition source' using errcode='22023';end if;
 if p_source='car-detailing-website' and coalesce(p_service_model,'mobile') not in('mobile','shop','both') then raise exception 'Invalid detailing setup' using errcode='22023';end if;
 if p_domain_preference not in('existing_domain','need_domain') or (p_domain_preference='existing_domain' and (p_domain_name is null or p_domain_name!~'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:[.][a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$')) then raise exception 'Invalid domain preference' using errcode='22023';end if;
 if length(btrim(p_name)) not between 2 and 120 or p_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid business identity' using errcode='22023';end if;
 if p_email!~*'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(btrim(p_phone))<7 or nullif(btrim(p_city),'') is null or nullif(btrim(p_state),'') is null then raise exception 'Invalid business details' using errcode='22023';end if;
 if cardinality(coalesce(p_services,'{}')) not between 1 and 20 or exists(select 1 from unnest(coalesce(p_services,'{}')) service where length(btrim(service)) not between 2 and 150) then raise exception 'Invalid services' using errcode='22023';end if;
 if length(coalesce(p_service_area,''))>150 or length(coalesce(p_description,''))>500 then raise exception 'Website details are too long' using errcode='22023';end if;

 select x.primary_color,x.secondary_color,x.hero,x.subheading,x.about_suffix,x.industry,x.industry_other into v_primary,v_secondary,v_hero,v_subheading,v_about_suffix,v_industry,v_industry_other from (values
  ('pest-control-website','#1769f5','#0b1733','Protect Your Home From Unwanted Guests','Reliable local pest control with clear communication and convenient service.',' provides dependable local pest-control service and a straightforward customer experience.','pest_control',null),
  ('car-detailing-website','#1677ff','#111827','Your Car Deserves More Than a Wash','Professional detailing, paint correction, and ceramic protection that makes every vehicle look its best.',' provides meticulous vehicle care, straightforward packages, and convenient scheduling.','other','car_detailing'),
  ('hvac-website','#1677ff','#10233f','Comfort You Can Count On, Every Season','Reliable local heating and cooling service with responsive scheduling and clear communication.',' provides dependable heating, cooling, and indoor-air service for local homes and businesses.','hvac',null),
  ('plumbing-website','#0878d1','#0b2844','Local Plumbing Help, Right When You Need It','Professional plumbing service for repairs, installations, drains, water heaters, and urgent problems.',' provides responsive local plumbing service, straightforward recommendations, and dependable workmanship.','plumbing',null),
  ('landscaping-website','#25824b','#173b2a','Outdoor Spaces Made Beautiful','Dependable local landscaping, lawn care, cleanups, irrigation, and outdoor improvements.',' creates and maintains attractive outdoor spaces with dependable scheduling and thoughtful service.','lawn_care',null),
  ('cleaning-website','#1597a5','#123c4a','A Cleaner Space, Without the Stress','Reliable home and commercial cleaning with simple scheduling and service you can trust.',' provides careful, dependable cleaning for local homes and businesses with convenient scheduling.','other','cleaning'),
  ('powerwashing-website','#0f8ec7','#12324a','A Cleaner Property Starts Outside','Professional power washing and exterior cleaning that helps homes and businesses look their best.',' delivers dependable exterior cleaning, clear communication, and straightforward scheduling for local properties.','other','power_washing'),
  ('junk-removal-website','#c65a12','#1f2937','Got Junk? We’ll Make It Disappear.','Furniture, appliances, yard debris, garage cleanouts, and more. Tell us what needs to go and we’ll take care of the heavy lifting.',' helps homeowners and businesses clear out unwanted items with fast response, upfront estimates, and dependable local service.','junk_removal',null),
  ('christmas-lights-website','#c62828','#113a5c','Professional Christmas Light Installation Without the Hassle','We design, install, maintain, and remove your Christmas lights so you can enjoy the season without climbing a ladder.',' creates polished holiday lighting displays for homes and commercial properties with design help, professional installation, in-season maintenance, and organized takedown after the season.','other','christmas_light_installation'),
  ('floral-event-website','#a64d79','#3f2936','Thoughtfully Designed for Life’s Beautiful Moments','Custom flowers and event styling created with care for weddings, celebrations, and meaningful gatherings.',' creates thoughtful floral designs and memorable event experiences with personal service from consultation through setup.','other','floral_event'),
  ('event-party-rentals-website','#e46a2c','#1f2a44','Inventory, Availability, and Event Bookings in One Place','Professional event-rental websites with availability-first browsing, customer-friendly booking, and organized delivery workflows.',' helps customers browse inventory, check dates, and plan events while your team stays organized behind the scenes.','party_rental',null)
 ) as x(source,primary_color,secondary_color,hero,subheading,about_suffix,industry,industry_other) where x.source=p_source;
 if p_source='car-detailing-website' then v_defaults=jsonb_build_object('service_model',coalesce(p_service_model,'mobile'));end if;
 insert into public.businesses(name,display_name,slug,owner_user_id,business_model,email,phone,city,state,country,timezone,primary_color,enabled_modules,industry_profile,industry_other,operating_model,onboarding_defaults,onboarding_completed_at)
 values(btrim(p_name),btrim(p_name),lower(btrim(p_slug)),null,'services',lower(btrim(p_email)),btrim(p_phone),btrim(p_city),upper(btrim(p_state)),'US','America/Phoenix',v_primary,'["booking","customers","team"]',v_industry,v_industry_other,'appointment_service',v_defaults,null) returning * into v_business;
 insert into public.business_onboarding_states(business_id,status,current_step,completed_steps,started_at,last_activity_at,updated_by) values(v_business.id,'in_progress',4,array['welcome','company','profile'],now(),now(),null);
 insert into public.business_entitlements(business_id,entitlement_key,status,source,metadata,created_by,updated_by) values(v_business.id,'pilot','active','pilot',jsonb_build_object('provisioned_by','website_first_onboarding','draft',true),null,null) returning * into v_entitlement;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,step_key,status,metadata) values(v_business.id,'step_completed',null,'profile','in_progress',jsonb_build_object('source',p_source,'completed_steps',array['welcome','company','profile'],'draft',true));
 insert into public.business_entitlement_audit_events(business_id,entitlement_id,event_type,actor_user_id,entitlement_key,status,metadata) values(v_business.id,v_entitlement.id,'provisioned',null,'pilot','active',v_entitlement.metadata);
 insert into public.business_website_onboarding_states(business_id,source,current_step,selected_services,domain_preference,domain_name,updated_by) values(v_business.id,p_source,'style',coalesce(p_services,'{}'),p_domain_preference,case when p_domain_preference='existing_domain' then lower(p_domain_name) else null end,null);
 insert into public.business_website_settings(business_id,public_slug,status,template_key,primary_color,secondary_color,hero_heading,hero_subheading,about_text,request_service_enabled,booking_enabled,updated_by) values(v_business.id,v_business.slug,'draft','modern',v_primary,v_secondary,v_hero,coalesce(nullif(btrim(p_description),''),v_subheading),coalesce(nullif(btrim(p_description),''),v_business.name||v_about_suffix),true,false,null);
 insert into public.services(business_id,name,description,duration_minutes,price_amount,price_label,recurring_allowed,required_skills,active,created_by,updated_by)
 select v_business.id,btrim(service),'Professional '||lower(btrim(service))||' from '||v_business.name||'.',60,null,'quote',true,'{}',true,null,null from unnest(coalesce(p_services,'{}')) service where length(btrim(service)) between 2 and 150;
 if nullif(btrim(p_service_area),'') is not null then insert into public.workforce_territories(business_id,name,territory_type,postal_codes,neighborhoods,is_active,created_by,updated_by) values(v_business.id,btrim(p_service_area),'mixed','{}','{}',true,null,null);end if;
 return v_business;
end$$;

notify pgrst,'reload schema';
commit;
