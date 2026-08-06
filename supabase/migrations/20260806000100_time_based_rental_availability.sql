-- Allow the same rental inventory to be booked more than once per day while
-- protecting overlapping reservations and the configured turnaround buffer.
create or replace function public.create_public_booking_quantities_timed(
  p_items jsonb, p_rental_date date, p_first_name text, p_last_name text,
  p_email text, p_phone text, p_event_start_time time, p_event_end_time time,
  p_delivery_address text, p_delivery_city text, p_delivery_zip text,
  p_notes text default ''
)
returns table (booking_id uuid, booking_number bigint)
language plpgsql security definer set search_path=public as $$
declare
  v_business_id uuid; v_customer_id uuid; v_booking_id uuid; v_booking_number bigint;
  v_total_cents integer:=0; v_count integer; v_item record; v_reserved integer;
  v_buffer integer:=60;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Please choose at least one rental item.'; end if;
  create temporary table requested_rental_items(inventory_item_id uuid primary key,quantity integer not null) on commit drop;
  begin
    insert into requested_rental_items select (entry->>'inventoryItemId')::uuid,(entry->>'quantity')::integer from jsonb_array_elements(p_items) entry;
  exception when others then raise exception 'The reservation contains an invalid item or quantity.';
  end;
  select count(*) into v_count from requested_rental_items;
  if v_count<>jsonb_array_length(p_items) then raise exception 'The same rental item cannot appear more than once.'; end if;
  if exists(select 1 from requested_rental_items where quantity<1 or quantity>10000) then raise exception 'Each rental quantity must be at least one.'; end if;
  select min(i.business_id::text)::uuid into v_business_id from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id;
  if v_business_id is null or (select count(distinct i.business_id) from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id)<>1 then raise exception 'All rental items must belong to the same business.'; end if;
  select coalesce(buffer_minutes,60) into v_buffer from public.booking_settings where business_id=v_business_id;
  v_buffer:=greatest(0,coalesce(v_buffer,60));
  if p_rental_date<current_date then raise exception 'Please choose a future rental date.'; end if;
  if p_event_end_time<=p_event_start_time then raise exception 'Event end time must be later than the start time.'; end if;
  if nullif(trim(p_first_name),'') is null or nullif(trim(p_last_name),'') is null or nullif(trim(p_email),'') is null or nullif(trim(p_phone),'') is null or nullif(trim(p_delivery_address),'') is null or nullif(trim(p_delivery_zip),'') is null then raise exception 'Please complete all required fields.'; end if;
  if (select count(*) from public.inventory_items i join requested_rental_items r on r.inventory_item_id=i.id where i.active)=0 or (select count(*) from public.inventory_items i join requested_rental_items r on r.inventory_item_id=i.id where i.active)<>v_count then raise exception 'One or more selected rental items are no longer available.'; end if;

  for v_item in select i.id,i.name,i.daily_price_cents,i.allow_quantity,i.stock_quantity,r.quantity from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id where i.active order by i.id loop
    perform pg_advisory_xact_lock(hashtextextended(v_item.id::text||':'||p_rental_date::text,0));
    if not v_item.allow_quantity and v_item.quantity<>1 then raise exception '% can only be reserved once per booking.',v_item.name; end if;
    if v_item.quantity>v_item.stock_quantity then raise exception 'Only % of % are available in inventory.',v_item.stock_quantity,v_item.name; end if;
    if exists(select 1 from public.blocked_dates where inventory_item_id=v_item.id and blocked_date=p_rental_date) then raise exception '% is blocked for that date.',v_item.name; end if;
    select coalesce(sum(bi.quantity),0)::integer into v_reserved
      from public.booking_items bi join public.bookings b on b.id=bi.booking_id
      where bi.inventory_item_id=v_item.id and bi.rental_date=p_rental_date
        and bi.status in ('pending_payment','paid','confirmed')
        and b.event_start_time < p_event_end_time + make_interval(mins=>v_buffer)
        and b.event_end_time + make_interval(mins=>v_buffer) > p_event_start_time;
    if v_reserved+v_item.quantity>v_item.stock_quantity then raise exception 'Only % of % remain available for that time. Choose another time that allows the % minute turnaround period.',greatest(v_item.stock_quantity-v_reserved,0),v_item.name,v_buffer; end if;
    v_total_cents:=v_total_cents+(v_item.daily_price_cents*v_item.quantity);
  end loop;

  insert into public.customers(business_id,first_name,last_name,email,phone)
  values(v_business_id,trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_phone))
  on conflict (business_id,(lower(email))) where email is not null and btrim(email)<>'' and is_deleted=false do update
    set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,updated_at=now()
  returning id into v_customer_id;
  insert into public.bookings(business_id,customer_id,status,event_start_time,event_end_time,delivery_address,delivery_city,delivery_state,delivery_zip,notes,subtotal_cents,tax_cents,total_cents,agreement_accepted_at)
  values(v_business_id,v_customer_id,'pending_payment',p_event_start_time,p_event_end_time,trim(p_delivery_address),trim(p_delivery_city),'AZ',trim(p_delivery_zip),nullif(trim(coalesce(p_notes,'')),''),v_total_cents,0,v_total_cents,now())
  returning id,public.bookings.booking_number into v_booking_id,v_booking_number;
  insert into public.booking_items(booking_id,inventory_item_id,rental_date,quantity,unit_price_cents,status)
    select v_booking_id,i.id,p_rental_date,r.quantity,i.daily_price_cents,'pending_payment' from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id order by i.id;
  return query select v_booking_id,v_booking_number;
end;$$;

revoke all on function public.create_public_booking_quantities_timed(jsonb,date,text,text,text,text,time,time,text,text,text,text) from public;
grant execute on function public.create_public_booking_quantities_timed(jsonb,date,text,text,text,text,time,time,text,text,text,text) to anon,authenticated,service_role;

-- Existing party-rental workspaces receive a safe one-hour turnaround unless
-- they already chose a buffer. The setting remains editable in Online Booking.
update public.booking_settings s set buffer_minutes=60
from public.businesses b where b.id=s.business_id and b.industry_profile='party_rental' and coalesce(s.buffer_minutes,0)=0;
