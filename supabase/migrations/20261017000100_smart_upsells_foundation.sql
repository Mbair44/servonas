-- Smart Upsells Phase 1: isolated tenant settings and immutable offer records.
-- This migration deliberately does not schedule messages, expose offers publicly, or alter bookings.

create table if not exists public.business_smart_upsell_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  enabled boolean not null default false,
  send_before_event_hours integer not null default 48 check (send_before_event_hours between 1 and 168),
  discount_basis_points integer not null default 5000 check (discount_basis_points between 0 and 10000),
  deposit_basis_points integer not null default 5000 check (deposit_basis_points between 0 and 10000),
  offer_expiration_hours integer not null default 24 check (offer_expiration_hours between 1 and 168),
  max_offers_per_booking integer not null default 1 check (max_offers_per_booking between 1 and 10),
  additional_delivery_fee_cents integer not null default 0 check (additional_delivery_fee_cents >= 0),
  automatic_selection boolean not null default true,
  minimum_discounted_price_cents integer check (minimum_discounted_price_cents is null or minimum_discounted_price_cents >= 0),
  sms_send_window_start_hour integer not null default 9 check (sms_send_window_start_hour between 0 and 23),
  sms_send_window_end_hour integer not null default 20 check (sms_send_window_end_hour between 0 and 23),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (sms_send_window_start_hour <> sms_send_window_end_hour)
);

create table if not exists public.smart_upsell_eligible_inventory_items (
  business_id uuid not null references public.businesses(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (business_id, inventory_item_id)
);
create table if not exists public.smart_upsell_excluded_inventory_items (
  business_id uuid not null references public.businesses(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (business_id, inventory_item_id)
);

create table if not exists public.smart_upsell_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  event_date date not null,
  rental_starts_at timestamptz not null,
  rental_ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','viewed','checkout_pending','accepted','expired','unavailable','failed','canceled')),
  request_key text not null,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  original_price_cents integer not null check (original_price_cents >= 0),
  discount_basis_points integer not null check (discount_basis_points between 0 and 10000),
  discount_cents integer not null check (discount_cents >= 0),
  discounted_price_cents integer not null check (discounted_price_cents >= 0),
  additional_delivery_fee_cents integer not null default 0 check (additional_delivery_fee_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  deposit_cents integer not null check (deposit_cents >= 0),
  remaining_balance_increment_cents integer not null check (remaining_balance_increment_cents >= 0),
  pricing_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(pricing_snapshot) = 'object'),
  tax_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(tax_snapshot) = 'object'),
  offer_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(offer_metadata) = 'object'),
  expires_at timestamptz not null,
  sent_at timestamptz,
  viewed_at timestamptz,
  checkout_started_at timestamptz,
  accepted_at timestamptz,
  canceled_at timestamptz,
  unavailable_at timestamptz,
  failed_at timestamptz,
  expired_at timestamptz,
  sms_message_id text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rental_ends_at > rental_starts_at),
  check (expires_at > created_at),
  check (discount_cents <= original_price_cents),
  check (discounted_price_cents = original_price_cents - discount_cents),
  check (deposit_cents + remaining_balance_increment_cents = discounted_price_cents + additional_delivery_fee_cents + tax_cents),
  unique (business_id, request_key),
  unique (token_hash)
);
create index if not exists smart_upsell_offers_booking_status_idx on public.smart_upsell_offers(business_id, booking_id, status, created_at desc);
create index if not exists smart_upsell_offers_expiry_idx on public.smart_upsell_offers(status, expires_at) where status in ('pending','sent','viewed','checkout_pending');

create table if not exists public.smart_upsell_offer_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  offer_id uuid not null references public.smart_upsell_offers(id) on delete cascade,
  event_type text not null,
  previous_status text,
  next_status text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists smart_upsell_offer_events_offer_idx on public.smart_upsell_offer_events(business_id, offer_id, created_at desc);

create or replace function public.enforce_smart_upsell_tenant_association() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = new.booking_id and business_id = new.business_id;
  if not found then raise exception 'Smart Upsell booking does not belong to this business.' using errcode='42501'; end if;
  if v_booking.customer_id <> new.customer_id then raise exception 'Smart Upsell customer does not belong to this booking.' using errcode='42501'; end if;
  if not exists(select 1 from public.inventory_items where id = new.inventory_item_id and business_id = new.business_id and active) then
    raise exception 'Smart Upsell inventory does not belong to this business or is inactive.' using errcode='42501';
  end if;
  if new.rental_starts_at <> v_booking.rental_starts_at or new.rental_ends_at <> v_booking.rental_ends_at then
    raise exception 'Smart Upsell rental window must match its booking.' using errcode='22023';
  end if;
  return new;
end $$;
drop trigger if exists smart_upsell_offer_tenant_guard on public.smart_upsell_offers;
create trigger smart_upsell_offer_tenant_guard before insert or update of business_id,booking_id,customer_id,inventory_item_id,rental_starts_at,rental_ends_at
on public.smart_upsell_offers for each row execute function public.enforce_smart_upsell_tenant_association();

create or replace function public.guard_smart_upsell_offer_transition() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status = old.status then return new; end if;
  if (old.status = 'pending' and new.status in ('sent','expired','unavailable','failed','canceled'))
    or (old.status = 'sent' and new.status in ('viewed','checkout_pending','expired','unavailable','failed','canceled'))
    or (old.status = 'viewed' and new.status in ('checkout_pending','expired','unavailable','failed','canceled'))
    or (old.status = 'checkout_pending' and new.status in ('accepted','expired','unavailable','failed','canceled')) then
    return new;
  end if;
  raise exception 'Invalid Smart Upsell offer state transition: % to %.', old.status, new.status using errcode='22023';
end $$;
drop trigger if exists smart_upsell_offer_transition_guard on public.smart_upsell_offers;
create trigger smart_upsell_offer_transition_guard before update of status on public.smart_upsell_offers
for each row execute function public.guard_smart_upsell_offer_transition();

create or replace function public.audit_smart_upsell_offer_transition() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.smart_upsell_offer_events(business_id,offer_id,event_type,next_status,metadata)
    values(new.business_id,new.id,'created',new.status,jsonb_build_object('request_key',new.request_key));
  elsif new.status is distinct from old.status then
    insert into public.smart_upsell_offer_events(business_id,offer_id,event_type,previous_status,next_status,metadata)
    values(new.business_id,new.id,'status_changed',old.status,new.status,jsonb_build_object('sms_message_id',new.sms_message_id,'stripe_checkout_session_id',new.stripe_checkout_session_id));
  end if;
  return new;
end $$;
drop trigger if exists smart_upsell_offer_audit on public.smart_upsell_offers;
create trigger smart_upsell_offer_audit after insert or update of status on public.smart_upsell_offers
for each row execute function public.audit_smart_upsell_offer_transition();

create or replace function public.create_smart_upsell_offer(
  p_business_id uuid, p_booking_id uuid, p_customer_id uuid, p_inventory_item_id uuid,
  p_event_date date, p_rental_starts_at timestamptz, p_rental_ends_at timestamptz,
  p_request_key text, p_token_hash text, p_original_price_cents integer, p_discount_basis_points integer,
  p_discount_cents integer, p_discounted_price_cents integer, p_additional_delivery_fee_cents integer,
  p_tax_cents integer, p_deposit_cents integer, p_remaining_balance_increment_cents integer,
  p_pricing_snapshot jsonb, p_tax_snapshot jsonb, p_offer_metadata jsonb, p_expires_at timestamptz
) returns public.smart_upsell_offers language plpgsql security definer set search_path=public as $$
declare v_settings public.business_smart_upsell_settings%rowtype; v_existing public.smart_upsell_offers%rowtype; v_active_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if nullif(btrim(coalesce(p_request_key,'')),'') is null then raise exception 'An idempotency key is required.'; end if;
  select * into v_existing from public.smart_upsell_offers where business_id=p_business_id and request_key=p_request_key;
  if found then return v_existing; end if;
  select * into v_settings from public.business_smart_upsell_settings where business_id=p_business_id for update;
  if not found or not v_settings.enabled then raise exception 'Smart Upsells are disabled for this business.' using errcode='P0001'; end if;
  if not exists(select 1 from public.smart_upsell_eligible_inventory_items where business_id=p_business_id and inventory_item_id=p_inventory_item_id)
    or exists(select 1 from public.smart_upsell_excluded_inventory_items where business_id=p_business_id and inventory_item_id=p_inventory_item_id) then
    raise exception 'This rental is not eligible for Smart Upsells.' using errcode='P0001';
  end if;
  select count(*) into v_active_count from public.smart_upsell_offers where business_id=p_business_id and booking_id=p_booking_id and status in ('pending','sent','viewed','checkout_pending','accepted');
  if v_active_count >= v_settings.max_offers_per_booking then raise exception 'Maximum Smart Upsell offers already exist for this booking.' using errcode='P0001'; end if;
  if p_discount_basis_points <> v_settings.discount_basis_points then raise exception 'Offer discount does not match tenant settings.' using errcode='22023'; end if;
  if v_settings.minimum_discounted_price_cents is not null and p_discounted_price_cents < v_settings.minimum_discounted_price_cents then raise exception 'Discounted price is below the tenant minimum.' using errcode='22023'; end if;
  if p_expires_at <= now() or p_expires_at > now()+make_interval(hours=>v_settings.offer_expiration_hours) then raise exception 'Offer expiration is invalid.' using errcode='22023'; end if;
  insert into public.smart_upsell_offers(business_id,booking_id,customer_id,inventory_item_id,event_date,rental_starts_at,rental_ends_at,request_key,token_hash,original_price_cents,discount_basis_points,discount_cents,discounted_price_cents,additional_delivery_fee_cents,tax_cents,deposit_cents,remaining_balance_increment_cents,pricing_snapshot,tax_snapshot,offer_metadata,expires_at)
  values(p_business_id,p_booking_id,p_customer_id,p_inventory_item_id,p_event_date,p_rental_starts_at,p_rental_ends_at,p_request_key,p_token_hash,p_original_price_cents,p_discount_basis_points,p_discount_cents,p_discounted_price_cents,p_additional_delivery_fee_cents,p_tax_cents,p_deposit_cents,p_remaining_balance_increment_cents,coalesce(p_pricing_snapshot,'{}'::jsonb),coalesce(p_tax_snapshot,'{}'::jsonb),coalesce(p_offer_metadata,'{}'::jsonb),p_expires_at)
  returning * into v_existing;
  return v_existing;
end $$;

create or replace function public.transition_smart_upsell_offer(p_offer_id uuid,p_business_id uuid,p_next_status text,p_metadata jsonb default '{}'::jsonb)
returns public.smart_upsell_offers language plpgsql security definer set search_path=public as $$
declare v_offer public.smart_upsell_offers%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select * into v_offer from public.smart_upsell_offers where id=p_offer_id and business_id=p_business_id for update;
  if not found then raise exception 'Smart Upsell offer not found.' using errcode='42501'; end if;
  if v_offer.status = 'accepted' and p_next_status = 'accepted' then
    raise exception 'Smart Upsell offer has already been accepted.' using errcode='P0001';
  end if;
  update public.smart_upsell_offers set status=p_next_status,offer_metadata=coalesce(offer_metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),
    sent_at=case when p_next_status='sent' then coalesce(sent_at,now()) else sent_at end,
    viewed_at=case when p_next_status='viewed' then coalesce(viewed_at,now()) else viewed_at end,
    checkout_started_at=case when p_next_status='checkout_pending' then coalesce(checkout_started_at,now()) else checkout_started_at end,
    accepted_at=case when p_next_status='accepted' then coalesce(accepted_at,now()) else accepted_at end,
    expired_at=case when p_next_status='expired' then coalesce(expired_at,now()) else expired_at end,
    canceled_at=case when p_next_status='canceled' then coalesce(canceled_at,now()) else canceled_at end,
    unavailable_at=case when p_next_status='unavailable' then coalesce(unavailable_at,now()) else unavailable_at end,
    failed_at=case when p_next_status='failed' then coalesce(failed_at,now()) else failed_at end,
    updated_at=now() where id=v_offer.id returning * into v_offer;
  return v_offer;
end $$;

alter table public.business_smart_upsell_settings enable row level security;
alter table public.smart_upsell_eligible_inventory_items enable row level security;
alter table public.smart_upsell_excluded_inventory_items enable row level security;
alter table public.smart_upsell_offers enable row level security;
alter table public.smart_upsell_offer_events enable row level security;

create policy "members view Smart Upsell settings" on public.business_smart_upsell_settings for select to authenticated using(public.is_business_member(business_id));
create policy "owners manage Smart Upsell settings" on public.business_smart_upsell_settings for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members view Smart Upsell inventory rules" on public.smart_upsell_eligible_inventory_items for select to authenticated using(public.is_business_member(business_id));
create policy "owners manage Smart Upsell eligible inventory" on public.smart_upsell_eligible_inventory_items for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members view Smart Upsell exclusions" on public.smart_upsell_excluded_inventory_items for select to authenticated using(public.is_business_member(business_id));
create policy "owners manage Smart Upsell exclusions" on public.smart_upsell_excluded_inventory_items for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "staff view Smart Upsell offers" on public.smart_upsell_offers for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "staff view Smart Upsell offer events" on public.smart_upsell_offer_events for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));

grant select,insert,update,delete on public.business_smart_upsell_settings,public.smart_upsell_eligible_inventory_items,public.smart_upsell_excluded_inventory_items to authenticated;
grant select on public.smart_upsell_offers,public.smart_upsell_offer_events to authenticated;
revoke all on function public.create_smart_upsell_offer(uuid,uuid,uuid,uuid,date,timestamptz,timestamptz,text,text,integer,integer,integer,integer,integer,integer,integer,integer,jsonb,jsonb,jsonb,timestamptz) from public;
revoke all on function public.transition_smart_upsell_offer(uuid,uuid,text,jsonb) from public;
grant execute on function public.create_smart_upsell_offer(uuid,uuid,uuid,uuid,date,timestamptz,timestamptz,text,text,integer,integer,integer,integer,integer,integer,integer,integer,jsonb,jsonb,jsonb,timestamptz) to service_role;
grant execute on function public.transition_smart_upsell_offer(uuid,uuid,text,jsonb) to service_role;
grant all on public.business_smart_upsell_settings,public.smart_upsell_eligible_inventory_items,public.smart_upsell_excluded_inventory_items,public.smart_upsell_offers,public.smart_upsell_offer_events to service_role;
