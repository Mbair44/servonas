-- NRS Party Rentals: quantity-based inventory for tables, chairs, and add-ons.
-- Run once in Supabase SQL Editor after the earlier booking migrations.

begin;

alter table public.inventory_items
  add column if not exists allow_quantity boolean not null default false,
  add column if not exists stock_quantity integer not null default 1;

alter table public.inventory_items
  drop constraint if exists inventory_items_stock_quantity_check;

alter table public.inventory_items
  add constraint inventory_items_stock_quantity_check
  check (stock_quantity >= 1 and stock_quantity <= 10000);

-- The former unique index only allowed one booking row per item/date. Capacity is now
-- enforced transactionally inside the booking function instead.
drop index if exists public.one_active_booking_per_item_date;

create or replace function public.get_inventory_capacity_usage(
  p_inventory_item_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  rental_date date,
  reserved_quantity integer,
  available_quantity integer,
  is_blocked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with item as (
    select stock_quantity
    from public.inventory_items
    where id = p_inventory_item_id and active = true
  ),
  reserved as (
    select bi.rental_date, coalesce(sum(bi.quantity), 0)::integer as quantity
    from public.booking_items bi
    where bi.inventory_item_id = p_inventory_item_id
      and bi.rental_date between p_start_date and p_end_date
      and bi.status in ('pending_payment', 'paid', 'confirmed')
    group by bi.rental_date
  ),
  blocked as (
    select bd.blocked_date as rental_date
    from public.blocked_dates bd
    where bd.inventory_item_id = p_inventory_item_id
      and bd.blocked_date between p_start_date and p_end_date
  ),
  affected_dates as (
    select rental_date from reserved
    union
    select rental_date from blocked
  )
  select
    d.rental_date,
    coalesce(r.quantity, 0)::integer,
    case when b.rental_date is not null then 0
         else greatest((select stock_quantity from item) - coalesce(r.quantity, 0), 0)::integer
    end,
    (b.rental_date is not null)
  from affected_dates d
  left join reserved r using (rental_date)
  left join blocked b using (rental_date)
  where exists (select 1 from item)
  order by d.rental_date;
$$;

grant execute on function public.get_inventory_capacity_usage(uuid, date, date) to anon, authenticated;

create or replace function public.create_public_booking_quantities(
  p_items jsonb,
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
  v_requested_count integer;
  v_distinct_count integer;
  v_item record;
  v_reserved integer;
  v_requested integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Please choose at least one rental item.';
  end if;

  create temporary table requested_items (
    inventory_item_id uuid primary key,
    quantity integer not null
  ) on commit drop;

  begin
    insert into requested_items (inventory_item_id, quantity)
    select
      (entry->>'inventoryItemId')::uuid,
      (entry->>'quantity')::integer
    from jsonb_array_elements(p_items) entry;
  exception
    when others then
      raise exception 'The reservation contains an invalid item or quantity.';
  end;

  select jsonb_array_length(p_items), count(*) into v_requested_count, v_distinct_count from requested_items;
  if v_requested_count <> v_distinct_count then
    raise exception 'The same rental item cannot appear more than once.';
  end if;

  if exists (select 1 from requested_items where quantity < 1 or quantity > 10000) then
    raise exception 'Each rental quantity must be at least one.';
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

  if (
    select count(*)
    from public.inventory_items i
    join requested_items r on r.inventory_item_id = i.id
    where i.active = true
  ) <> v_requested_count then
    raise exception 'One or more selected rental items are no longer available.';
  end if;

  -- Lock every requested item/date in a stable order. This prevents simultaneous
  -- checkouts from overselling shared stock.
  for v_item in
    select i.id, i.name, i.daily_price_cents, i.allow_quantity, i.stock_quantity, r.quantity
    from requested_items r
    join public.inventory_items i on i.id = r.inventory_item_id
    where i.active = true
    order by i.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_item.id::text || ':' || p_rental_date::text, 0));

    if not v_item.allow_quantity and v_item.quantity <> 1 then
      raise exception '% can only be reserved once per booking.', v_item.name;
    end if;
    if v_item.quantity > v_item.stock_quantity then
      raise exception 'Only % of % are available in inventory.', v_item.stock_quantity, v_item.name;
    end if;
    if exists (
      select 1 from public.blocked_dates
      where inventory_item_id = v_item.id and blocked_date = p_rental_date
    ) then
      raise exception '% is blocked for that date.', v_item.name;
    end if;

    select coalesce(sum(quantity), 0)::integer into v_reserved
    from public.booking_items
    where inventory_item_id = v_item.id
      and rental_date = p_rental_date
      and status in ('pending_payment', 'paid', 'confirmed');

    v_requested := v_item.quantity;
    if v_reserved + v_requested > v_item.stock_quantity then
      raise exception 'Only % of % remain available for that date.', greatest(v_item.stock_quantity - v_reserved, 0), v_item.name;
    end if;

    v_total_cents := v_total_cents + (v_item.daily_price_cents * v_item.quantity);
  end loop;

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

  insert into public.booking_items (
    booking_id, inventory_item_id, rental_date, quantity, unit_price_cents, status
  )
  select
    v_booking_id, i.id, p_rental_date, r.quantity, i.daily_price_cents, 'pending_payment'
  from requested_items r
  join public.inventory_items i on i.id = r.inventory_item_id
  order by i.id;

  return query select v_booking_id, v_booking_number;
end;
$$;

revoke all on function public.create_public_booking_quantities(
  jsonb, date, text, text, text, text, time, time, text, text, text, text
) from public;

grant execute on function public.create_public_booking_quantities(
  jsonb, date, text, text, text, text, time, time, text, text, text, text
) to anon, authenticated;

commit;
