begin;

create table public.business_onboarding_states(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 status text not null default 'not_started' check(status in ('not_started','in_progress','completed','reopened')),
 current_step integer not null default 1 check(current_step between 1 and 6),
 completed_steps text[] not null default '{}',
 started_at timestamptz,
 last_activity_at timestamptz not null default now(),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 check(completed_steps <@ array['welcome','company','profile','hours','service','readiness']::text[]),
 check(status<>'completed' or completed_at is not null)
);
create table public.business_entitlements(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 entitlement_key text not null,
 status text not null check(status in ('active','inactive','expired')),
 source text not null check(source in ('pilot','subscription','manual')),
 starts_at timestamptz not null default now(),
 ends_at timestamptz,
 metadata jsonb not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid references auth.users(id),
 updated_by uuid references auth.users(id),
 unique(business_id,entitlement_key),
 check(jsonb_typeof(metadata)='object'),check(ends_at is null or ends_at>starts_at)
);
create index business_entitlements_access_idx on public.business_entitlements(business_id,status,entitlement_key);
create table public.business_onboarding_audit_events(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 event_type text not null,actor_user_id uuid references auth.users(id),step_key text,status text,metadata jsonb not null default '{}',occurred_at timestamptz not null default now(),
 check(jsonb_typeof(metadata)='object')
);
create table public.business_entitlement_audit_events(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 entitlement_id uuid not null references public.business_entitlements(id),event_type text not null,actor_user_id uuid references auth.users(id),
 entitlement_key text not null,status text not null,metadata jsonb not null default '{}',occurred_at timestamptz not null default now(),check(jsonb_typeof(metadata)='object')
);
alter table public.business_onboarding_states enable row level security;alter table public.business_entitlements enable row level security;
alter table public.business_onboarding_audit_events enable row level security;alter table public.business_entitlement_audit_events enable row level security;
create policy "office reads onboarding state" on public.business_onboarding_states for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners manage onboarding state" on public.business_onboarding_states for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read active entitlements" on public.business_entitlements for select to authenticated using(public.is_business_member(business_id));
create policy "office reads onboarding audit" on public.business_onboarding_audit_events for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "office reads entitlement audit" on public.business_entitlement_audit_events for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create or replace function public.prevent_onboarding_audit_mutation() returns trigger language plpgsql as $$begin raise exception 'Onboarding audit history is immutable';end$$;
create trigger onboarding_audit_immutable before update or delete on public.business_onboarding_audit_events for each row execute function public.prevent_onboarding_audit_mutation();
create trigger entitlement_audit_immutable before update or delete on public.business_entitlement_audit_events for each row execute function public.prevent_onboarding_audit_mutation();

insert into public.business_onboarding_states(business_id,status,current_step,completed_steps,started_at,completed_at)
select id,'completed',6,array['welcome','company','profile','hours','service','readiness'],coalesce(created_at,now()),coalesce(onboarding_completed_at,now()) from public.businesses
on conflict(business_id) do nothing;
insert into public.business_entitlements(business_id,entitlement_key,status,source,metadata)
select id,'pilot','active','pilot',jsonb_build_object('backfilled_existing_tenant',true) from public.businesses on conflict(business_id,entitlement_key) do nothing;
insert into public.business_entitlement_audit_events(business_id,entitlement_id,event_type,entitlement_key,status,metadata)
select business_id,id,'provisioned','pilot','active',metadata from public.business_entitlements where entitlement_key='pilot'
and not exists(select 1 from public.business_entitlement_audit_events a where a.entitlement_id=business_entitlements.id);

create or replace function public.create_business_workspace(p_name text,p_slug text,p_email text,p_business_model text,p_primary_color text,p_enabled_modules jsonb)
returns public.businesses language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_business public.businesses;v_entitlement public.business_entitlements;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501';end if;
 if length(trim(p_name))<2 then raise exception 'Business name is required' using errcode='22023';end if;
 if p_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid workspace slug' using errcode='22023';end if;
 if p_business_model not in ('rentals','services','appointments','hybrid') then raise exception 'Invalid business model' using errcode='22023';end if;
 insert into public.businesses(name,slug,owner_user_id,business_model,email,primary_color,enabled_modules,onboarding_completed_at)
 values(trim(p_name),lower(trim(p_slug)),v_user,p_business_model,nullif(trim(p_email),''),coalesce(nullif(p_primary_color,''),'#2563eb'),coalesce(p_enabled_modules,'[]'::jsonb),null) returning * into v_business;
 insert into public.business_members(business_id,user_id,role) values(v_business.id,v_user,'owner');
 insert into public.business_onboarding_states(business_id,status,current_step,completed_steps,started_at,updated_by)
 values(v_business.id,'in_progress',1,'{}',now(),v_user);
 insert into public.business_entitlements(business_id,entitlement_key,status,source,metadata,created_by,updated_by)
 values(v_business.id,'pilot','active','pilot',jsonb_build_object('provisioned_by','workspace_creation'),v_user,v_user) returning * into v_entitlement;
 insert into public.business_onboarding_audit_events(business_id,event_type,actor_user_id,status,metadata) values(v_business.id,'started',v_user,'in_progress',jsonb_build_object('current_step',1));
 insert into public.business_entitlement_audit_events(business_id,entitlement_id,event_type,actor_user_id,entitlement_key,status,metadata)
 values(v_business.id,v_entitlement.id,'provisioned',v_user,'pilot','active',v_entitlement.metadata);
 return v_business;
end$$;
grant execute on function public.create_business_workspace(text,text,text,text,text,jsonb) to authenticated;
comment on table public.business_entitlements is 'Tenant access source of truth. Pilot is server-provisioned and future paid plans reuse this lifecycle.';
commit;
