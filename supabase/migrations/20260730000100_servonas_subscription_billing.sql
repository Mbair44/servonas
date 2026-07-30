begin;

create table if not exists public.business_platform_subscriptions(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null unique references public.businesses(id) on delete cascade,
 stripe_customer_id text unique,
 stripe_subscription_id text unique,
 stripe_checkout_session_id text,
 stripe_price_id text,
 status text not null default 'trialing' check(status in('checkout_pending','trialing','active','past_due','paused','canceled','unpaid','incomplete','incomplete_expired')),
 trial_ends_at timestamptz,
 current_period_ends_at timestamptz,
 cancel_at_period_end boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.business_platform_subscriptions enable row level security;
create policy "owners read platform subscriptions" on public.business_platform_subscriptions for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin']));
create policy "owners start platform subscriptions" on public.business_platform_subscriptions for insert to authenticated
 with check(public.has_business_role(business_id,array['owner','admin']));
create policy "owners update platform subscriptions" on public.business_platform_subscriptions for update to authenticated
 using(public.has_business_role(business_id,array['owner','admin']))
 with check(public.has_business_role(business_id,array['owner','admin']));

create or replace function public.ensure_servonas_trial(p_business_id uuid,p_days integer default 30)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare v_end timestamptz;
begin
 if not public.has_business_role(p_business_id,array['owner','admin']) and auth.role()<>'service_role' then raise exception 'Permission denied' using errcode='42501';end if;
 if p_days<1 or p_days>90 then raise exception 'Invalid trial length' using errcode='22023';end if;
 update public.business_entitlements set ends_at=coalesce(ends_at,starts_at+make_interval(days=>p_days)),
  metadata=metadata||jsonb_build_object('trial_days',p_days,'billing_required_after_trial',true),updated_at=now()
  where business_id=p_business_id and entitlement_key='pilot' and status in('active','grace_period')
  returning ends_at into v_end;
 return v_end;
end$$;
revoke all on function public.ensure_servonas_trial(uuid,integer) from public;
grant execute on function public.ensure_servonas_trial(uuid,integer) to authenticated,service_role;

commit;
