begin;

create table if not exists public.business_website_management(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 enabled boolean not null default false,
 monthly_cost_cents integer not null default 0 check(monthly_cost_cents>=0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
create table if not exists public.business_website_management_periods(
 business_id uuid not null references public.businesses(id) on delete cascade,
 billing_period_start date not null check(billing_period_start=date_trunc('month',billing_period_start)::date),
 managed boolean not null default false,
 cost_cents integer not null default 0 check(cost_cents>=0),
 updated_at timestamptz not null default now(),
 primary key(business_id,billing_period_start)
);
create table if not exists public.platform_business_admin_state(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 lifecycle_status text not null default 'active' check(lifecycle_status in('active','deactivated')),
 deactivated_at timestamptz,
 deactivated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
create table if not exists public.platform_business_admin_events(
 id uuid primary key default gen_random_uuid(),
 business_id uuid,
 business_name text not null,
 event_type text not null check(event_type in('website_management_changed','deactivated','reactivated','permanently_deleted')),
 actor_user_id uuid references auth.users(id) on delete set null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

alter table public.business_website_management enable row level security;
alter table public.business_website_management_periods enable row level security;
alter table public.platform_business_admin_state enable row level security;
alter table public.platform_business_admin_events enable row level security;
drop policy if exists "platform admins manage website management" on public.business_website_management;
create policy "platform admins manage website management" on public.business_website_management for all to authenticated using(public.is_servonas_platform_admin()) with check(public.is_servonas_platform_admin());
drop policy if exists "platform admins read website management periods" on public.business_website_management_periods;
create policy "platform admins read website management periods" on public.business_website_management_periods for select to authenticated using(public.is_servonas_platform_admin());
drop policy if exists "platform admins manage business state" on public.platform_business_admin_state;
create policy "platform admins manage business state" on public.platform_business_admin_state for all to authenticated using(public.is_servonas_platform_admin()) with check(public.is_servonas_platform_admin());
drop policy if exists "platform admins read business admin events" on public.platform_business_admin_events;
create policy "platform admins read business admin events" on public.platform_business_admin_events for select to authenticated using(public.is_servonas_platform_admin());

create or replace function public.admin_set_business_website_management(p_business_id uuid,p_enabled boolean,p_monthly_cost_cents integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
 if not public.is_servonas_platform_admin() then raise exception 'Platform administrator access is required' using errcode='42501';end if;
 if p_monthly_cost_cents<0 then raise exception 'Website cost cannot be negative' using errcode='22023';end if;
 select name into v_name from public.businesses where id=p_business_id and is_deleted=false for update;
 if v_name is null then raise exception 'Business not found' using errcode='P0002';end if;
 insert into public.business_website_management(business_id,enabled,monthly_cost_cents,updated_by) values(p_business_id,p_enabled,p_monthly_cost_cents,auth.uid())
 on conflict(business_id) do update set enabled=excluded.enabled,monthly_cost_cents=excluded.monthly_cost_cents,updated_at=now(),updated_by=auth.uid();
 insert into public.business_website_management_periods(business_id,billing_period_start,managed,cost_cents) values(p_business_id,date_trunc('month',now())::date,p_enabled,case when p_enabled then p_monthly_cost_cents else 0 end)
 on conflict(business_id,billing_period_start) do update set managed=excluded.managed,cost_cents=excluded.cost_cents,updated_at=now();
 insert into public.platform_business_admin_events(business_id,business_name,event_type,actor_user_id,metadata) values(p_business_id,v_name,'website_management_changed',auth.uid(),jsonb_build_object('enabled',p_enabled,'monthly_cost_cents',p_monthly_cost_cents));
end$$;

create or replace function public.admin_set_business_lifecycle(p_business_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_name text;v_status text:=case when p_active then 'active' else 'deactivated' end;
begin
 if not public.is_servonas_platform_admin() then raise exception 'Platform administrator access is required' using errcode='42501';end if;
 select name into v_name from public.businesses where id=p_business_id and is_deleted=false for update;
 if v_name is null then raise exception 'Business not found' using errcode='P0002';end if;
 insert into public.platform_business_admin_state(business_id,lifecycle_status,deactivated_at,deactivated_by) values(p_business_id,v_status,case when p_active then null else now() end,case when p_active then null else auth.uid() end)
 on conflict(business_id) do update set lifecycle_status=excluded.lifecycle_status,deactivated_at=excluded.deactivated_at,deactivated_by=excluded.deactivated_by,updated_at=now();
 if p_active then
  update public.business_entitlements set status='active',suspended_at=null,suspended_by=null,suspension_reason=null,updated_at=now(),updated_by=auth.uid() where business_id=p_business_id and status='suspended';
 else
  update public.business_ai_assistant_access set enabled=false,updated_at=now(),updated_by=auth.uid() where business_id=p_business_id;
  update public.business_twilio_access set enabled=false,updated_at=now(),updated_by=auth.uid() where business_id=p_business_id;
  update public.booking_settings set enabled=false,updated_at=now(),updated_by=auth.uid() where business_id=p_business_id;
  update public.business_website_settings set status='draft',published_at=null,updated_at=now(),updated_by=auth.uid() where business_id=p_business_id;
  update public.business_entitlements set status='suspended',suspended_at=now(),suspended_by=auth.uid(),suspension_reason='Deactivated by Servonas platform administrator',updated_at=now(),updated_by=auth.uid() where business_id=p_business_id and status in('active','grace_period');
 end if;
 insert into public.platform_business_admin_events(business_id,business_name,event_type,actor_user_id) values(p_business_id,v_name,case when p_active then 'reactivated' else 'deactivated' end,auth.uid());
end$$;

create or replace function public.admin_delete_business_permanently(p_business_id uuid,p_business_name text,p_confirmation text)
returns void language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
 if not public.is_servonas_platform_admin() then raise exception 'Platform administrator access is required' using errcode='42501';end if;
 if p_confirmation<>'DELETE' then raise exception 'Permanent deletion confirmation is required' using errcode='22023';end if;
 select name into v_name from public.businesses where id=p_business_id and is_deleted=false for update;
 if v_name is null then raise exception 'Business not found' using errcode='P0002';end if;
 if btrim(p_business_name)<>v_name then raise exception 'Business name confirmation does not match' using errcode='22023';end if;
 insert into public.platform_business_admin_events(business_id,business_name,event_type,actor_user_id) values(p_business_id,v_name,'permanently_deleted',auth.uid());
 delete from public.businesses where id=p_business_id;
end$$;

revoke all on function public.admin_set_business_website_management(uuid,boolean,integer) from public;
revoke all on function public.admin_set_business_lifecycle(uuid,boolean) from public;
revoke all on function public.admin_delete_business_permanently(uuid,text,text) from public;
grant execute on function public.admin_set_business_website_management(uuid,boolean,integer) to authenticated;
grant execute on function public.admin_set_business_lifecycle(uuid,boolean) to authenticated;
grant execute on function public.admin_delete_business_permanently(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
