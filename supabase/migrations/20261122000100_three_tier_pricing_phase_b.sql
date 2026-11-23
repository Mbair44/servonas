-- Phase B only: schema and server-side accounting primitives. No backfill changes
-- a tenant's plan, Twilio access, Stripe subscription, or payment collection.
begin;

alter table public.business_entitlements drop constraint if exists business_entitlements_code_check;
alter table public.business_entitlements add constraint business_entitlements_code_check
 check(entitlement_key in('pilot','starter','growth','scale','business','enterprise')) not valid;
alter table public.business_platform_subscriptions add column if not exists plan_key text check(plan_key in('growth','scale'));

create table if not exists public.business_pricing_profiles(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 plan_key text not null default 'legacy' check(plan_key in('legacy','starter','growth','scale')),
 billing_anchor_at timestamptz,
 rollout_enabled boolean not null default false,
 legacy_pricing_preserved boolean not null default true,
 migrated_at timestamptz,
 migrated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((plan_key='legacy' and rollout_enabled=false) or plan_key<>'legacy')
);
insert into public.business_pricing_profiles(business_id)
 select id from public.businesses on conflict(business_id) do nothing;
alter table public.business_pricing_profiles enable row level security;
create policy "business admins read pricing profile" on public.business_pricing_profiles for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());
revoke insert,update,delete on public.business_pricing_profiles from anon,authenticated;

create table if not exists public.servonas_subscription_plan_prices(
 stripe_price_id text primary key, plan_key text not null check(plan_key in('growth','scale')),
 active boolean not null default true, created_at timestamptz not null default now()
);
alter table public.servonas_subscription_plan_prices enable row level security;
create policy "platform admins read subscription plan prices" on public.servonas_subscription_plan_prices for select to authenticated using(public.is_servonas_platform_admin());
revoke insert,update,delete on public.servonas_subscription_plan_prices from anon,authenticated;

create table if not exists public.platform_fee_cycles(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete restrict,
 cycle_starts_at timestamptz not null, cycle_ends_at timestamptz not null,
 cap_cents integer not null default 9900 check(cap_cents=9900), captured_cents integer not null default 0 check(captured_cents>=0),
 reserved_cents integer not null default 0 check(reserved_cents>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,cycle_starts_at), check(cycle_ends_at>cycle_starts_at)
);

-- Calendar-month anniversary, not calendar-month reset. PostgreSQL's interval
-- arithmetic intentionally handles anchors such as the 29th–31st.
create or replace function public.pricing_billing_cycle_bounds(p_anchor timestamptz,p_at timestamptz default now())
returns table(cycle_starts_at timestamptz,cycle_ends_at timestamptz) language plpgsql immutable as $$
declare v_anchor timestamptz:=coalesce(p_anchor,p_at); v_months integer; v_start timestamptz;
begin
 v_months:=(extract(year from p_at at time zone 'UTC')::integer-extract(year from v_anchor at time zone 'UTC')::integer)*12
   +(extract(month from p_at at time zone 'UTC')::integer-extract(month from v_anchor at time zone 'UTC')::integer);
 v_start:=v_anchor+make_interval(months=>greatest(v_months,0));
 if v_start>p_at then v_start:=v_anchor+make_interval(months=>greatest(v_months-1,0)); end if;
 return query select v_start,v_start+interval '1 month';
end $$;

create table if not exists public.platform_fee_reservations(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete restrict,
 cycle_id uuid not null references public.platform_fee_cycles(id) on delete restrict,
 idempotency_key text not null, payment_reference text, eligible_amount_cents integer not null check(eligible_amount_cents>=0),
 reserved_fee_cents integer not null check(reserved_fee_cents>=0), state text not null check(state in('reserved','captured','released','reconciliation_required')),
 expires_at timestamptz not null, captured_at timestamptz, released_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(business_id,idempotency_key), unique(business_id,payment_reference)
);

create table if not exists public.platform_fee_ledger(
 id bigint generated always as identity primary key, business_id uuid not null references public.businesses(id) on delete restrict,
 cycle_id uuid not null references public.platform_fee_cycles(id) on delete restrict, reservation_id uuid references public.platform_fee_reservations(id) on delete restrict,
 event_key text not null unique, event_type text not null check(event_type in('reserved','released','captured','refund_reversal','dispute_opened','dispute_won','dispute_lost','reconciliation_exception')),
 amount_cents integer not null, eligible_amount_cents integer, provider text not null default 'stripe', provider_payment_id text, provider_refund_id text, provider_event_id text,
 metadata jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists platform_fee_ledger_business_cycle_idx on public.platform_fee_ledger(business_id,cycle_id,occurred_at);
create or replace function public.prevent_platform_fee_ledger_mutation() returns trigger language plpgsql as $$ begin raise exception 'platform_fee_ledger is append-only'; end $$;
drop trigger if exists platform_fee_ledger_no_mutation on public.platform_fee_ledger;
create trigger platform_fee_ledger_no_mutation before update or delete on public.platform_fee_ledger for each row execute function public.prevent_platform_fee_ledger_mutation();

-- All fee allocation is serialized by the fee-cycle row. This RPC only reserves
-- capacity; Phase C will pass its result as application_fee_amount to Stripe.
create or replace function public.reserve_platform_fee(p_business_id uuid,p_cycle_starts_at timestamptz,p_cycle_ends_at timestamptz,p_idempotency_key text,p_eligible_amount_cents integer,p_expires_at timestamptz)
returns table(reservation_id uuid,fee_cents integer,remaining_cap_cents integer) language plpgsql security definer set search_path=public as $$
declare v_profile public.business_pricing_profiles; v_cycle public.platform_fee_cycles; v_fee integer; v_existing public.platform_fee_reservations; v_expected_start timestamptz; v_expected_end timestamptz;
begin
 if p_eligible_amount_cents<0 or p_expires_at<=now() then raise exception 'Invalid fee reservation'; end if;
 select * into v_profile from public.business_pricing_profiles where business_id=p_business_id for update;
 if not found or v_profile.plan_key='legacy' or not v_profile.rollout_enabled then return query select null::uuid,0,9900; return; end if;
 if v_profile.plan_key not in('starter','growth','scale') then raise exception 'Invalid pricing plan'; end if;
 select cycle_starts_at,cycle_ends_at into v_expected_start,v_expected_end from public.pricing_billing_cycle_bounds(v_profile.billing_anchor_at,now());
 if p_cycle_starts_at<>v_expected_start or p_cycle_ends_at<>v_expected_end then raise exception 'Invalid billing cycle'; end if;
 insert into public.platform_fee_cycles(business_id,cycle_starts_at,cycle_ends_at) values(p_business_id,p_cycle_starts_at,p_cycle_ends_at)
 on conflict(business_id,cycle_starts_at) do nothing;
 select * into v_cycle from public.platform_fee_cycles where business_id=p_business_id and cycle_starts_at=p_cycle_starts_at for update;
 select * into v_existing from public.platform_fee_reservations where business_id=p_business_id and idempotency_key=p_idempotency_key;
 if found then return query select v_existing.id,v_existing.reserved_fee_cents,greatest(v_cycle.cap_cents-v_cycle.captured_cents-v_cycle.reserved_cents,0); return; end if;
 v_fee:=least(((p_eligible_amount_cents*300+5000)/10000)::integer,greatest(v_cycle.cap_cents-v_cycle.captured_cents-v_cycle.reserved_cents,0));
 insert into public.platform_fee_reservations(business_id,cycle_id,idempotency_key,eligible_amount_cents,reserved_fee_cents,state,expires_at) values(p_business_id,v_cycle.id,p_idempotency_key,p_eligible_amount_cents,v_fee,'reserved',p_expires_at) returning * into v_existing;
 update public.platform_fee_cycles set reserved_cents=reserved_cents+v_fee,updated_at=now() where id=v_cycle.id;
 insert into public.platform_fee_ledger(business_id,cycle_id,reservation_id,event_key,event_type,amount_cents,eligible_amount_cents,metadata) values(p_business_id,v_cycle.id,v_existing.id,'reserve:'||p_business_id::text||':'||p_idempotency_key,'reserved',v_fee,p_eligible_amount_cents,jsonb_build_object('rounding','half_up','basis_points',300));
 return query select v_existing.id,v_fee,greatest(v_cycle.cap_cents-v_cycle.captured_cents-v_cycle.reserved_cents-v_fee,0);
end $$;

create table if not exists public.manual_booking_usage_ledger(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete restrict,
 cycle_starts_at timestamptz not null, request_key text not null, booking_id uuid references public.bookings(id) on delete restrict,
 actor_user_id uuid references auth.users(id) on delete set null, origin text not null check(origin='staff_manual'), state text not null check(state in('reserved','consumed','released')),
 grace boolean not null default false, grace_reason text, created_at timestamptz not null default now(), finalized_at timestamptz,
 unique(business_id,request_key), unique(booking_id)
);
create index if not exists manual_booking_usage_cycle_idx on public.manual_booking_usage_ledger(business_id,cycle_starts_at,state);
create or replace function public.claim_manual_booking_allowance(p_business_id uuid,p_request_key text,p_actor_user_id uuid)
returns table(allowed boolean,usage_id uuid,remaining integer,reason text) language plpgsql security definer set search_path=public as $$
declare v_profile public.business_pricing_profiles; v_cycle timestamptz; v_used integer; v_existing public.manual_booking_usage_ledger;
begin
 select * into v_profile from public.business_pricing_profiles where business_id=p_business_id for update;
 if not found or v_profile.plan_key<>'starter' or not v_profile.rollout_enabled then return query select true,null::uuid,null::integer,'unmetered'; return; end if;
 select cycle_starts_at into v_cycle from public.pricing_billing_cycle_bounds(v_profile.billing_anchor_at,now());
 select * into v_existing from public.manual_booking_usage_ledger where business_id=p_business_id and request_key=p_request_key;
 if found then return query select true,v_existing.id,greatest(0,10-(select count(*) from public.manual_booking_usage_ledger where business_id=p_business_id and cycle_starts_at=v_cycle and state in('reserved','consumed')),0),'idempotent'; return; end if;
 select count(*) into v_used from public.manual_booking_usage_ledger where business_id=p_business_id and cycle_starts_at=v_cycle and state in('reserved','consumed');
 if v_used>=10 then return query select false,null::uuid,0,'limit_reached'; return; end if;
 insert into public.manual_booking_usage_ledger(business_id,cycle_starts_at,request_key,actor_user_id,origin,state) values(p_business_id,v_cycle,p_request_key,p_actor_user_id,'staff_manual','reserved') returning id into usage_id;
 return query select true,usage_id,9-v_used,'reserved';
end $$;
create or replace function public.finalize_manual_booking_allowance(p_usage_id uuid,p_booking_id uuid default null,p_failed boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$ begin update public.manual_booking_usage_ledger set state=case when p_failed then 'released' else 'consumed' end,booking_id=case when p_failed then booking_id else p_booking_id end,finalized_at=now() where id=p_usage_id and state='reserved'; return found; end $$;

alter table public.platform_fee_cycles enable row level security;
alter table public.platform_fee_reservations enable row level security;
alter table public.platform_fee_ledger enable row level security;
alter table public.manual_booking_usage_ledger enable row level security;
create policy "owners read platform fee ledger" on public.platform_fee_ledger for select to authenticated using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());
create policy "owners read manual booking usage" on public.manual_booking_usage_ledger for select to authenticated using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());
revoke all on function public.reserve_platform_fee(uuid,timestamptz,timestamptz,text,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.claim_manual_booking_allowance(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.finalize_manual_booking_allowance(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_platform_fee(uuid,timestamptz,timestamptz,text,integer,timestamptz) to service_role;
grant execute on function public.claim_manual_booking_allowance(uuid,text,uuid) to service_role;
grant execute on function public.finalize_manual_booking_allowance(uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
