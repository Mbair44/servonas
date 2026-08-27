begin;

alter table public.business_invitations
  drop constraint if exists business_invitations_role_check;
alter table public.business_invitations
  add constraint business_invitations_role_check check (role in ('owner','admin','manager','staff'));

create table if not exists public.platform_business_owner_setups(
  business_id uuid primary key references public.businesses(id) on delete cascade,
  owner_first_name text,
  owner_last_name text,
  owner_email text not null unique,
  owner_phone text,
  owner_status text not null default 'not_invited' check(owner_status in('not_invited','invited','activated')),
  owner_invited_at timestamptz,
  owner_activated_at timestamptz,
  customer_type text not null default 'standard' check(customer_type in('standard','pilot','internal_test')),
  service_area text,
  internal_admin_notes text,
  last_activation_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_business_owner_setups enable row level security;
drop policy if exists "platform admins manage owner setups" on public.platform_business_owner_setups;
create policy "platform admins manage owner setups" on public.platform_business_owner_setups
  for all to authenticated
  using(public.is_servonas_platform_admin())
  with check(public.is_servonas_platform_admin());

create or replace function public.admin_create_business_setup(
  p_name text,
  p_slug text,
  p_owner_email text,
  p_owner_first_name text,
  p_owner_last_name text,
  p_owner_phone text,
  p_business_email text,
  p_business_phone text,
  p_website_url text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_service_area text,
  p_timezone text,
  p_industry text,
  p_customer_type text,
  p_internal_admin_notes text,
  p_created_by uuid
) returns table(id uuid,slug text)
language plpgsql security definer set search_path=public as $$
declare
  v_business public.businesses;
begin
  if not public.is_servonas_platform_admin() then raise exception 'Platform administrator access is required' using errcode='42501'; end if;
  if coalesce(length(btrim(p_name)),0) < 2 then raise exception 'Business name is required' using errcode='22023'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid workspace slug' using errcode='22023'; end if;
  if coalesce(p_owner_email,'') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Valid owner email is required' using errcode='22023'; end if;
  if exists(select 1 from public.platform_business_owner_setups where lower(owner_email)=lower(p_owner_email)) then raise exception 'Owner email already reserved' using errcode='23505'; end if;

  insert into public.businesses(
    name,display_name,slug,owner_user_id,business_model,email,phone,website_url,city,state,postal_code,timezone,industry_profile,primary_color,enabled_modules
  ) values (
    btrim(p_name),btrim(p_name),lower(btrim(p_slug)),null,'services',nullif(btrim(p_business_email),''),nullif(btrim(p_business_phone),''),nullif(btrim(p_website_url),''),nullif(btrim(p_city),''),nullif(btrim(p_state),''),nullif(btrim(p_postal_code),''),coalesce(nullif(btrim(p_timezone),''),'America/Phoenix'),nullif(btrim(p_industry),''),'#2563eb','["booking","payments","customers","team"]'::jsonb
  ) returning * into v_business;

  insert into public.platform_business_owner_setups(
    business_id,owner_first_name,owner_last_name,owner_email,owner_phone,customer_type,service_area,internal_admin_notes
  ) values (
    v_business.id,nullif(btrim(p_owner_first_name),''),nullif(btrim(p_owner_last_name),''),lower(btrim(p_owner_email)),nullif(btrim(p_owner_phone),''),coalesce(nullif(btrim(p_customer_type),''),'standard'),nullif(btrim(p_service_area),''),nullif(btrim(p_internal_admin_notes),'')
  );

  insert into public.business_onboarding_states(business_id,status,current_step,completed_steps,started_at,last_activity_at,updated_by)
  values(v_business.id,'in_progress',3,array['welcome','company'],now(),now(),p_created_by)
  on conflict (business_id) do nothing;

  insert into public.platform_business_admin_events(business_id,business_name,event_type,actor_user_id,metadata)
  values(v_business.id,v_business.name,'reactivated',p_created_by,jsonb_build_object('admin_setup',true,'customer_type',p_customer_type,'owner_email',lower(btrim(p_owner_email))));

  return query select v_business.id,v_business.slug;
end $$;

create or replace function public.admin_update_business_setup(
  p_business_id uuid,
  p_name text,
  p_industry text,
  p_business_phone text,
  p_business_email text,
  p_website_url text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_service_area text,
  p_timezone text,
  p_owner_first_name text,
  p_owner_last_name text,
  p_owner_email text,
  p_owner_phone text,
  p_customer_type text,
  p_internal_admin_notes text,
  p_updated_by uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_name text;
begin
  if not public.is_servonas_platform_admin() then raise exception 'Platform administrator access is required' using errcode='42501'; end if;
  select name into v_name from public.businesses where id=p_business_id and is_deleted=false for update;
  if v_name is null then raise exception 'Business not found' using errcode='P0002'; end if;
  update public.businesses
    set name=coalesce(nullif(btrim(p_name),''),name),
        display_name=coalesce(nullif(btrim(p_name),''),display_name),
        industry_profile=coalesce(nullif(btrim(p_industry),''),industry_profile),
        phone=nullif(btrim(p_business_phone),''),
        email=nullif(btrim(p_business_email),''),
        website_url=nullif(btrim(p_website_url),''),
        city=nullif(btrim(p_city),''),
        state=nullif(btrim(p_state),''),
        postal_code=nullif(btrim(p_postal_code),''),
        timezone=coalesce(nullif(btrim(p_timezone),''),timezone),
        updated_at=now(),
        updated_by=p_updated_by
  where id=p_business_id;
  update public.platform_business_owner_setups
    set owner_first_name=nullif(btrim(p_owner_first_name),''),
        owner_last_name=nullif(btrim(p_owner_last_name),''),
        owner_email=coalesce(nullif(lower(btrim(p_owner_email)),''),owner_email),
        owner_phone=nullif(btrim(p_owner_phone),''),
        service_area=nullif(btrim(p_service_area),''),
        customer_type=coalesce(nullif(btrim(p_customer_type),''),customer_type),
        internal_admin_notes=nullif(btrim(p_internal_admin_notes),''),
        updated_at=now()
  where business_id=p_business_id;
  insert into public.platform_business_admin_events(business_id,business_name,event_type,actor_user_id,metadata)
  values(p_business_id,coalesce(nullif(btrim(p_name),''),v_name),'website_management_changed',p_updated_by,jsonb_build_object('admin_setup_update',true));
end $$;

create or replace function public.admin_mark_owner_invitation_status(
  p_business_id uuid,
  p_owner_status text,
  p_owner_invited_at timestamptz,
  p_owner_activation_link text,
  p_changed_by uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_name text;
begin
  if not public.is_servonas_platform_admin() then raise exception 'Platform administrator access is required' using errcode='42501'; end if;
  select name into v_name from public.businesses where id=p_business_id and is_deleted=false;
  if v_name is null then raise exception 'Business not found' using errcode='P0002'; end if;
  update public.platform_business_owner_setups
    set owner_status=p_owner_status,
        owner_invited_at=coalesce(p_owner_invited_at,owner_invited_at),
        last_activation_link=coalesce(p_owner_activation_link,last_activation_link),
        updated_at=now()
  where business_id=p_business_id;
  insert into public.platform_business_admin_events(business_id,business_name,event_type,actor_user_id,metadata)
  values(p_business_id,v_name,'website_management_changed',p_changed_by,jsonb_build_object('owner_status',p_owner_status,'owner_invited_at',p_owner_invited_at));
end $$;

create or replace function public.activate_admin_created_business_owner(
  p_business_id uuid,
  p_user_id uuid,
  p_user_email text
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_setup public.platform_business_owner_setups;
begin
  select * into v_setup from public.platform_business_owner_setups where business_id=p_business_id for update;
  if v_setup.business_id is null then raise exception 'Activation setup not found' using errcode='P0002'; end if;
  if lower(v_setup.owner_email) <> lower(coalesce(p_user_email,'')) then raise exception 'Invited email does not match' using errcode='42501'; end if;

  insert into public.business_members(business_id,user_id,role)
  values(p_business_id,p_user_id,'owner')
  on conflict (business_id,user_id) do update set role='owner';

  update public.businesses
    set owner_user_id=p_user_id,
        updated_at=now()
  where id=p_business_id and (owner_user_id is null or owner_user_id=p_user_id);
  if not found then raise exception 'Business owner already assigned' using errcode='23505'; end if;

  update public.platform_business_owner_setups
    set owner_status='activated',
        owner_activated_at=now(),
        updated_at=now()
  where business_id=p_business_id;

  insert into public.platform_business_admin_events(business_id,business_name,event_type,actor_user_id,metadata)
  select b.id,b.name,'website_management_changed',p_user_id,jsonb_build_object('owner_activated',true)
  from public.businesses b where b.id=p_business_id;
end $$;

revoke all on function public.admin_create_business_setup(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,uuid) from public;
revoke all on function public.admin_update_business_setup(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,uuid) from public;
revoke all on function public.admin_mark_owner_invitation_status(uuid,text,timestamptz,text,uuid) from public;
revoke all on function public.activate_admin_created_business_owner(uuid,uuid,text) from public;
grant execute on function public.admin_create_business_setup(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.admin_update_business_setup(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.admin_mark_owner_invitation_status(uuid,text,timestamptz,text,uuid) to authenticated;
grant execute on function public.activate_admin_created_business_owner(uuid,uuid,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
