-- NRS Party Rentals: secure public booking function
-- Run this once in Supabase SQL Editor before testing the booking form.

begin;

create or replace function public.create_public_booking(
  p_inventory_item_id uuid,
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
  v_price_cents integer;
begin
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

  select daily_price_cents
    into v_price_cents
  from public.inventory_items
  where id = p_inventory_item_id
    and active = true
  for update;

  if v_price_cents is null then
    raise exception 'That rental item is no longer available.';
  end if;

  if not public.is_inventory_available(p_inventory_item_id, p_rental_date) then
    raise exception 'That date is already reserved or unavailable. Please choose another date.';
  end if;

  insert into public.customers (
    first_name, last_name, email, phone
  ) values (
    trim(p_first_name), trim(p_last_name), lower(trim(p_email)), trim(p_phone)
  )
  on conflict ((lower(email))) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        phone = excluded.phone,
        updated_at = now()
  returning id into v_customer_id;

  insert into public.bookings (
    customer_id,
    status,
    event_start_time,
    event_end_time,
    delivery_address,
    delivery_city,
    delivery_state,
    delivery_zip,
    notes,
    subtotal_cents,
    tax_cents,
    total_cents,
    agreement_accepted_at
  ) values (
    v_customer_id,
    'pending_payment',
    p_event_start_time,
    p_event_end_time,
    trim(p_delivery_address),
    p_delivery_city,
    'AZ',
    trim(p_delivery_zip),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_price_cents,
    0,
    v_price_cents,
    now()
  )
  returning id, public.bookings.booking_number
    into v_booking_id, v_booking_number;

  begin
    insert into public.booking_items (
      booking_id,
      inventory_item_id,
      rental_date,
      quantity,
      unit_price_cents,
      status
    ) values (
      v_booking_id,
      p_inventory_item_id,
      p_rental_date,
      1,
      v_price_cents,
      'pending_payment'
    );
  exception
    when unique_violation then
      raise exception 'That date was just reserved by someone else. Please choose another date.';
  end;

  return query select v_booking_id, v_booking_number;
end;
$$;

revoke all on function public.create_public_booking(
  uuid, date, text, text, text, text, time, time, text, text, text, text
) from public;

grant execute on function public.create_public_booking(
  uuid, date, text, text, text, text, time, time, text, text, text, text
) to anon, authenticated;

commit;
