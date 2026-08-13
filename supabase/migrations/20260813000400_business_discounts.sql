begin;

create table public.discounts(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null, code text not null, normalized_code text generated always as (upper(btrim(code))) stored,
 discount_type text not null check(discount_type in('percentage','fixed')), discount_value integer not null check(discount_value>0),
 applies_to text not null default 'order' check(applies_to in('order','selected_items')), application_method text not null default 'code' check(application_method in('code','automatic')),
 minimum_subtotal_cents integer check(minimum_subtotal_cents is null or minimum_subtotal_cents>=0), starts_at timestamptz, expires_at timestamptz,
 usage_limit integer check(usage_limit is null or usage_limit>0), per_customer_limit integer check(per_customer_limit is null or per_customer_limit>0),
 first_time_customer_only boolean not null default false, is_active boolean not null default true,
 announcement_enabled boolean not null default false, announcement_text text,
 created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_id,normalized_code),
 check(length(name) between 1 and 160), check(code ~ '^[A-Za-z0-9_-]{2,40}$'),
 check((discount_type='percentage' and discount_value<=10000) or discount_type='fixed'), check(starts_at is null or expires_at is null or expires_at>starts_at),
 check(announcement_text is null or length(announcement_text)<=240)
);
create table public.discount_items(
 id uuid primary key default gen_random_uuid(),
 discount_id uuid not null references public.discounts(id) on delete cascade,
 business_id uuid not null references public.businesses(id) on delete cascade,
 inventory_item_id uuid references public.inventory_items(id) on delete cascade,
 service_id uuid references public.services(id) on delete cascade,
 check((inventory_item_id is not null)::integer+(service_id is not null)::integer=1)
);
create unique index discount_inventory_target_unique on public.discount_items(discount_id,inventory_item_id) where inventory_item_id is not null;
create unique index discount_service_target_unique on public.discount_items(discount_id,service_id) where service_id is not null;
create or replace function public.enforce_discount_item_tenant() returns trigger language plpgsql set search_path=public as $$ begin
 if not exists(select 1 from public.discounts where id=new.discount_id and business_id=new.business_id) then raise exception 'discount_tenant_mismatch'; end if;
 if new.inventory_item_id is not null and not exists(select 1 from public.inventory_items where id=new.inventory_item_id and business_id=new.business_id) then raise exception 'inventory_tenant_mismatch'; end if;
 if new.service_id is not null and not exists(select 1 from public.services where id=new.service_id and business_id=new.business_id) then raise exception 'service_tenant_mismatch'; end if;
 return new; end;$$;
create trigger discount_item_tenant_guard before insert or update on public.discount_items for each row execute function public.enforce_discount_item_tenant();
create table public.discount_redemptions(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 discount_id uuid not null references public.discounts(id) on delete restrict, customer_id uuid references public.customers(id) on delete set null,
 booking_id uuid references public.bookings(id) on delete cascade, amount_discounted_cents integer not null check(amount_discounted_cents>=0),
 status text not null default 'pending' check(status in('pending','redeemed','voided')), redeemed_at timestamptz, created_at timestamptz not null default now(),
 unique(business_id,booking_id)
);
create table public.discount_audit_events(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 discount_id uuid references public.discounts(id) on delete set null, actor_user_id uuid references auth.users(id) on delete set null,
 event_type text not null check(event_type in('created','updated','activated','deactivated')), changes jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.bookings add column if not exists discount_id uuid references public.discounts(id) on delete set null;
alter table public.bookings add column if not exists discount_code text;
alter table public.bookings add column if not exists discount_name text;
create index discounts_business_active_idx on public.discounts(business_id,is_active,starts_at,expires_at);
create index discount_redemptions_usage_idx on public.discount_redemptions(discount_id,status,redeemed_at);
create index discount_redemptions_customer_idx on public.discount_redemptions(discount_id,customer_id,status);

alter table public.discounts enable row level security; alter table public.discount_items enable row level security;
alter table public.discount_redemptions enable row level security; alter table public.discount_audit_events enable row level security;
create policy "members read discounts" on public.discounts for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage discounts" on public.discounts for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read discount items" on public.discount_items for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage discount items" on public.discount_items for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read discount redemptions" on public.discount_redemptions for select to authenticated using(public.is_business_member(business_id));
create policy "members read discount audit" on public.discount_audit_events for select to authenticated using(public.is_business_member(business_id));
revoke insert,update,delete on public.discount_redemptions,public.discount_audit_events from anon,authenticated;
create trigger discounts_updated_at before update on public.discounts for each row execute function public.set_routing_updated_at();

create or replace function public.reserve_discount_redemption(p_business_id uuid,p_discount_id uuid,p_customer_id uuid,p_booking_id uuid,p_amount integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_discount public.discounts; v_id uuid;
begin
 select * into v_discount from public.discounts where id=p_discount_id and business_id=p_business_id for update;
 if not found or not v_discount.is_active then raise exception 'discount_unavailable'; end if;
 if v_discount.usage_limit is not null and (select count(*) from public.discount_redemptions where discount_id=p_discount_id and status in('pending','redeemed'))>=v_discount.usage_limit then raise exception 'discount_usage_limit'; end if;
 if p_customer_id is not null and v_discount.per_customer_limit is not null and (select count(*) from public.discount_redemptions where discount_id=p_discount_id and customer_id=p_customer_id and status in('pending','redeemed'))>=v_discount.per_customer_limit then raise exception 'discount_customer_limit'; end if;
 insert into public.discount_redemptions(business_id,discount_id,customer_id,booking_id,amount_discounted_cents) values(p_business_id,p_discount_id,p_customer_id,p_booking_id,p_amount)
 on conflict(business_id,booking_id) do update set discount_id=excluded.discount_id,customer_id=excluded.customer_id,amount_discounted_cents=excluded.amount_discounted_cents
 returning id into v_id; return v_id;
end;$$;
create or replace function public.finalize_discount_redemption(p_business_id uuid,p_booking_id uuid)
returns void language sql security definer set search_path=public as $$
 update public.discount_redemptions set status='redeemed',redeemed_at=coalesce(redeemed_at,now()) where business_id=p_business_id and booking_id=p_booking_id and status='pending';
$$;
revoke all on function public.reserve_discount_redemption(uuid,uuid,uuid,uuid,integer),public.finalize_discount_redemption(uuid,uuid) from public;
grant execute on function public.reserve_discount_redemption(uuid,uuid,uuid,uuid,integer),public.finalize_discount_redemption(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
