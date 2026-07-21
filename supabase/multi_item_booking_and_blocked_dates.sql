-- NRS Party Rentals: multi-item bookings, double-booking protection, and blocked dates.
-- Run this once in Supabase SQL Editor after the existing booking and Stripe migrations.

begin;

-- Prevent the same inventory item from being actively reserved twice on the same date.
create unique index if not exists one_active_booking_per_item_date
on public.booking_items (inventory_item_id, rental_date)
where status in ('pending_payment', 'paid', 'confirmed');

-- Prevent duplicate item/date blocks.
create unique index if not exists one_block_per_item_date
on public.blocked_dates (inventory_item_id, blocked_date);


create or replace function public.lock_inventory_date(
  p_inventory_item_id uuid,
  p_rental_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_inventory_item_id::text || ':' || p_rental_date::text, 0));
end;
$$;

revoke all on function public.lock_inventory_date(uuid, date) from public;
grant execute on function public.lock_inventory_date(uuid, date) to service_role;

create or replace function public.create_inventory_block(
  p_inventory_item_id uuid,
  p_blocked_date date,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_blocked_date < current_date then
    raise exception 'Please choose today or a future date.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_inventory_item_id::text || ':' || p_blocked_date::text, 0));

  if not exists (select 1 from public.inventory_items where id = p_inventory_item_id) then
    raise exception 'Rental item not found.';
  end if;

  if exists (
    select 1 from public.booking_items
    where inventory_item_id = p_inventory_item_id
      and rental_date = p_blocked_date
      and status in ('pending_payment', 'paid', 'confirmed')
  ) then
    raise exception 'That item already has an active booking on this date.';
  end if;

  insert into public.blocked_dates (inventory_item_id, blocked_date, reason)
  values (p_inventory_item_id, p_blocked_date, nullif(trim(coalesce(p_reason, '')), ''))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'That date is already blocked for this item.';
end;
$$;

revoke all on function public.create_inventory_block(uuid, date, text) from public;
grant execute on function public.create_inventory_block(uuid, date, text) to service_role;

create or replace function public.create_public_booking_multi(
  p_inventory_item_ids uuid[],
  p_rental_date date,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_event_start_time time,
  p_event_end_time time,
  p_delivery_address text,
  p_delivery_city text,
  p_delivery_zip text,
  p_notes text default ''
)
returns table (booking_id uuid, booking_number bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_booking_id uuid;
  v_booking_number bigint;
  v_total_cents integer := 0;
  v_item_count integer;
  v_distinct_count integer;
  v_item record;
begin
  if p_inventory_item_ids is null or cardinality(p_inventory_item_ids) = 0 then
    raise exception 'Please choose at least one rental item.';
  end if;

  v_item_count := cardinality(p_inventory_item_ids);
  select count(distinct value)
    into v_distinct_count
  from unnest(p_inventory_item_ids) as ids(value);

  if v_item_count <> v_distinct_count then
    raise exception 'The same rental item cannot be added twice.';
  end if;

  if p_rental_date < current_date then
    raise exception 'Please choose a future rental date.';
  end if;

  if p_delivery_city not in ('Gilbert', 'Chandler', 'Mesa') then
    raise exception 'Delivery is currently available only in Gilbert, Chandler, and Mesa.';
  end if;

  if p_event_end_time <= p_event_start_time then
    raise exception 'Event end time must be later than the start time.';
  end if;

  if nullif(trim(p_first_name), '') is null
     or nullif(trim(p_last_name), '') is null
     or nullif(trim(p_email), '') is null
     or nullif(trim(p_phone), '') is null
     or nullif(trim(p_delivery_address), '') is null
     or nullif(trim(p_delivery_zip), '') is null then
    raise exception 'Please complete all required fields.';
  end if;

  -- Advisory locks serialize simultaneous attempts for the same item/date.
  for v_item in
    select i.id, i.daily_price_cents
    from public.inventory_items i
    where i.id = any(p_inventory_item_ids)
      and i.active = true
    order by i.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_item.id::text || ':' || p_rental_date::text, 0));
    v_total_cents := v_total_cents + v_item.daily_price_cents;
  end loop;

  if (select count(*) from public.inventory_items i where i.id = any(p_inventory_item_ids) and i.active = true) <> v_item_count then
    raise exception 'One or more selected rental items are no longer available.';
  end if;

  if exists (
    select 1
    from unnest(p_inventory_item_ids) as selected(item_id)
    where not public.is_inventory_available(selected.item_id, p_rental_date)
  ) then
    raise exception 'One or more selected items are already reserved or blocked for that date.';
  end if;

  insert into public.customers (first_name, last_name, email, phone)
  values (trim(p_first_name), trim(p_last_name), lower(trim(p_email)), trim(p_phone))
  on conflict ((lower(email))) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        phone = excluded.phone,
        updated_at = now()
  returning id into v_customer_id;

  insert into public.bookings (
    customer_id, status, event_start_time, event_end_time,
    delivery_address, delivery_city, delivery_state, delivery_zip,
    notes, subtotal_cents, tax_cents, total_cents, agreement_accepted_at
  ) values (
    v_customer_id, 'pending_payment', p_event_start_time, p_event_end_time,
    trim(p_delivery_address), p_delivery_city, 'AZ', trim(p_delivery_zip),
    nullif(trim(coalesce(p_notes, '')), ''), v_total_cents, 0, v_total_cents, now()
  )
  returning id, public.bookings.booking_number into v_booking_id, v_booking_number;

  begin
    insert into public.booking_items (
      booking_id, inventory_item_id, rental_date, quantity, unit_price_cents, status
    )
    select
      v_booking_id, i.id, p_rental_date, 1, i.daily_price_cents, 'pending_payment'
    from public.inventory_items i
    where i.id = any(p_inventory_item_ids)
    order by i.id;
  exception
    when unique_violation then
      raise exception 'One or more selected items were just reserved by someone else. Please choose another date.';
  end;

  return query select v_booking_id, v_booking_number;
end;
$$;

revoke all on function public.create_public_booking_multi(
  uuid[], date, text, text, text, text, time, time, text, text, text, text
) from public;

grant execute on function public.create_public_booking_multi(
  uuid[], date, text, text, text, text, time, time, text, text, text, text
) to anon, authenticated;

commit;
