-- A staged amendment owns a short-lived resource hold while the customer completes
-- Checkout. It never changes booking lines or totals until the paid webhook applies it.
create table public.booking_amendments (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 booking_id uuid not null references public.bookings(id) on delete cascade,
 amendment_type text not null check(amendment_type='add_items'),
 requested_items jsonb not null check(jsonb_typeof(requested_items)='array' and jsonb_array_length(requested_items)>0),
 pricing_snapshot jsonb not null default '{}'::jsonb check(jsonb_typeof(pricing_snapshot)='object'),
 old_totals jsonb not null default '{}'::jsonb check(jsonb_typeof(old_totals)='object'),
 new_totals jsonb not null default '{}'::jsonb check(jsonb_typeof(new_totals)='object'),
 required_payment_cents integer not null default 0 check(required_payment_cents>=0),
 status text not null default 'pending_payment' check(status in ('pending_payment','payment_processing','applying','paid','applied','failed','cancelled','expired','application_failed')),
 idempotency_key text not null,
 stripe_checkout_session_id text unique,
 stripe_payment_intent_id text unique,
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 paid_at timestamptz, applied_at timestamptz, expired_at timestamptz, failure_reason text,
 unique(booking_id,idempotency_key)
);
create index booking_amendments_active_idx on public.booking_amendments(business_id,booking_id,expires_at) where status in ('pending_payment','payment_processing');

create table public.booking_amendment_inventory_holds (
 id uuid primary key default gen_random_uuid(), amendment_id uuid not null references public.booking_amendments(id) on delete cascade,
 business_id uuid not null references public.businesses(id) on delete cascade,
 resource_inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
 quantity integer not null check(quantity>0), rental_starts_at timestamptz not null, rental_ends_at timestamptz not null,
 created_at timestamptz not null default now(), check(rental_ends_at>rental_starts_at),
 unique(amendment_id,resource_inventory_item_id)
);
create index booking_amendment_holds_capacity_idx on public.booking_amendment_inventory_holds(business_id,resource_inventory_item_id,rental_starts_at,rental_ends_at);
alter table public.booking_amendments enable row level security;
alter table public.booking_amendment_inventory_holds enable row level security;
create policy "staff view booking amendments" on public.booking_amendments for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));

-- Checkout and every other writer of permanent reservations must honor a live
-- staged hold. The amendment RPC changes its own hold to `applying` only after it
-- owns the same resource advisory locks, then inserts its permanent reservations.
create or replace function public.reject_reservation_conflicting_with_amendment_hold() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.booking_amendment_inventory_holds h join public.booking_amendments a on a.id=h.amendment_id
   where h.business_id=new.business_id and h.resource_inventory_item_id=new.resource_inventory_item_id
     and a.status in ('pending_payment','payment_processing') and a.expires_at>now()
     and h.rental_starts_at<new.rental_ends_at+make_interval(mins=>coalesce((select buffer_minutes from public.booking_settings where business_id=new.business_id),60))
     and h.rental_ends_at+make_interval(mins=>coalesce((select buffer_minutes from public.booking_settings where business_id=new.business_id),60))>new.rental_starts_at) then
  raise exception 'This rental is temporarily held by another checkout.' using errcode='P0001';
 end if;
 return new;
end $$;
drop trigger if exists booking_inventory_reservations_amendment_hold_guard on public.booking_inventory_reservations;
create trigger booking_inventory_reservations_amendment_hold_guard before insert on public.booking_inventory_reservations
 for each row execute function public.reject_reservation_conflicting_with_amendment_hold();

create or replace function public.create_booking_item_amendment_hold(
 p_business_id uuid,p_booking_id uuid,p_requested_items jsonb,p_pricing_snapshot jsonb,p_old_totals jsonb,p_new_totals jsonb,
 p_required_payment_cents integer,p_idempotency_key text,p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path=public as $$
declare b public.bookings%rowtype; amendment_id uuid; resource record; reserved integer; buffer integer:=60;
begin
 if auth.role()<>'service_role' then raise exception 'service role required'; end if;
 if p_required_payment_cents<0 or p_expires_at<=now() or p_requested_items is null or jsonb_typeof(p_requested_items)<>'array' or jsonb_array_length(p_requested_items)=0 then raise exception 'Invalid amendment.'; end if;
 select * into b from public.bookings where id=p_booking_id and business_id=p_business_id for update;
 if not found or b.status not in ('pending_payment','paid','confirmed') then raise exception 'Booking cannot be amended.'; end if;
 if b.rental_starts_at is null or b.rental_ends_at is null then raise exception 'Booking rental window is invalid.'; end if;
 select coalesce(buffer_minutes,60) into buffer from public.booking_settings where business_id=p_business_id;
 select id into amendment_id from public.booking_amendments where booking_id=p_booking_id and idempotency_key=p_idempotency_key for update;
 if amendment_id is not null then return amendment_id; end if;
 create temporary table amendment_items(inventory_item_id uuid primary key,quantity integer not null) on commit drop;
 begin insert into amendment_items select (entry->>'inventoryItemId')::uuid,(entry->>'quantity')::integer from jsonb_array_elements(p_requested_items) entry; exception when others then raise exception 'Invalid amendment items.'; end;
 if (select count(*) from amendment_items)<>jsonb_array_length(p_requested_items) or exists(select 1 from amendment_items where quantity<1 or quantity>10000) then raise exception 'Invalid amendment items.'; end if;
 if exists(select 1 from amendment_items a left join public.inventory_items i on i.id=a.inventory_item_id where i.id is null or i.business_id<>p_business_id or not i.active) then raise exception 'One or more selected rentals are unavailable.'; end if;
 create temporary table amendment_resources on commit drop as select q.resource_inventory_item_id,sum(a.quantity*q.quantity_required)::integer quantity from amendment_items a join public.rental_listing_inventory_requirements q on q.listing_inventory_item_id=a.inventory_item_id group by q.resource_inventory_item_id;
 if (select count(*) from amendment_resources)=0 then raise exception 'One or more selected rentals do not have included inventory configured.'; end if;
 for resource in select i.id,i.name,i.stock_quantity,r.quantity from amendment_resources r join public.inventory_items i on i.id=r.resource_inventory_item_id order by i.id loop
  perform pg_advisory_xact_lock(hashtextextended(resource.id::text,0));
  select coalesce(sum(quantity),0)::integer into reserved from (
   select r.quantity from public.booking_inventory_reservations r join public.bookings other_booking on other_booking.id=r.booking_id
    where r.resource_inventory_item_id=resource.id and other_booking.status in ('pending_payment','paid','confirmed') and r.rental_starts_at<b.rental_ends_at+make_interval(mins=>buffer) and r.rental_ends_at+make_interval(mins=>buffer)>b.rental_starts_at
   union all
   select h.quantity from public.booking_amendment_inventory_holds h join public.booking_amendments a on a.id=h.amendment_id
    where h.resource_inventory_item_id=resource.id and a.status in ('pending_payment','payment_processing') and a.expires_at>now() and h.rental_starts_at<b.rental_ends_at+make_interval(mins=>buffer) and h.rental_ends_at+make_interval(mins=>buffer)>b.rental_starts_at
  ) commitments;
  if reserved+resource.quantity>resource.stock_quantity then raise exception '% is already reserved for that rental period.',resource.name; end if;
 end loop;
 insert into public.booking_amendments(business_id,booking_id,amendment_type,requested_items,pricing_snapshot,old_totals,new_totals,required_payment_cents,idempotency_key,expires_at,status)
  values(p_business_id,p_booking_id,'add_items',p_requested_items,p_pricing_snapshot,p_old_totals,p_new_totals,p_required_payment_cents,p_idempotency_key,p_expires_at,case when p_required_payment_cents=0 then 'payment_processing' else 'pending_payment' end) returning id into amendment_id;
 insert into public.booking_amendment_inventory_holds(amendment_id,business_id,resource_inventory_item_id,quantity,rental_starts_at,rental_ends_at)
  select amendment_id,p_business_id,resource_inventory_item_id,quantity,b.rental_starts_at,b.rental_ends_at from amendment_resources;
 return amendment_id;
end $$;
revoke all on function public.create_booking_item_amendment_hold(uuid,uuid,jsonb,jsonb,jsonb,jsonb,integer,text,timestamptz) from public;
grant execute on function public.create_booking_item_amendment_hold(uuid,uuid,jsonb,jsonb,jsonb,jsonb,integer,text,timestamptz) to service_role;

create or replace function public.expire_booking_item_amendments() returns integer language plpgsql security definer set search_path=public as $$
declare affected integer; begin
 if auth.role()<>'service_role' then raise exception 'service role required'; end if;
 update public.booking_amendments set status='expired',expired_at=now() where status in ('pending_payment','payment_processing') and expires_at<=now(); get diagnostics affected=row_count; return affected;
end $$;
revoke all on function public.expire_booking_item_amendments() from public;
grant execute on function public.expire_booking_item_amendments() to service_role;
