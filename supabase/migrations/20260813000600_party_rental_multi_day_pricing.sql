alter table public.booking_settings
 add column if not exists standard_rental_hours integer not null default 24,
 add column if not exists allow_multi_day_rentals boolean not null default false,
 add column if not exists additional_day_pricing_type text not null default 'full_price',
 add column if not exists additional_day_discount_percent numeric(5,2) not null default 0,
 add column if not exists additional_day_flat_rate_cents integer,
 add column if not exists max_rental_days integer;
alter table public.booking_settings drop constraint if exists booking_settings_standard_rental_hours_check;
alter table public.booking_settings add constraint booking_settings_standard_rental_hours_check check(standard_rental_hours between 1 and 168);
alter table public.booking_settings drop constraint if exists booking_settings_additional_day_pricing_check;
alter table public.booking_settings add constraint booking_settings_additional_day_pricing_check check(additional_day_pricing_type in ('full_price','percentage_discount','flat_rate') and additional_day_discount_percent between 0 and 100 and (additional_day_flat_rate_cents is null or additional_day_flat_rate_cents>=0) and (max_rental_days is null or max_rental_days between 1 and 365));

alter table public.inventory_items
 add column if not exists standard_rental_hours_override integer,
 add column if not exists allow_multi_day_override boolean,
 add column if not exists additional_day_pricing_type_override text,
 add column if not exists additional_day_discount_percent_override numeric(5,2),
 add column if not exists additional_day_flat_rate_cents_override integer,
 add column if not exists max_rental_days_override integer;
alter table public.inventory_items drop constraint if exists inventory_items_rental_pricing_override_check;
alter table public.inventory_items add constraint inventory_items_rental_pricing_override_check check((standard_rental_hours_override is null or standard_rental_hours_override between 1 and 168) and (additional_day_pricing_type_override is null or additional_day_pricing_type_override in ('full_price','percentage_discount','flat_rate')) and (additional_day_discount_percent_override is null or additional_day_discount_percent_override between 0 and 100) and (additional_day_flat_rate_cents_override is null or additional_day_flat_rate_cents_override>=0) and (max_rental_days_override is null or max_rental_days_override between 1 and 365));

alter table public.bookings add column if not exists rental_starts_at timestamptz;
alter table public.bookings add column if not exists rental_ends_at timestamptz;
alter table public.booking_items
 add column if not exists rental_days integer,
 add column if not exists base_unit_price_cents integer,
 add column if not exists additional_day_unit_price_cents integer,
 add column if not exists rental_pricing_type text,
 add column if not exists standard_rental_hours integer;

create index if not exists bookings_business_rental_interval_idx on public.bookings(business_id,rental_starts_at,rental_ends_at) where rental_starts_at is not null and rental_ends_at is not null;

create or replace function public.create_public_booking_quantities_timed(
 p_items jsonb,p_rental_date date,p_rental_end_date date,p_first_name text,p_last_name text,
 p_email text,p_phone text,p_event_start_time time,p_event_end_time time,
 p_delivery_address text,p_delivery_city text,p_delivery_zip text,p_notes text default ''
) returns table(booking_id uuid,booking_number bigint)
language plpgsql security definer set search_path=public as $$
declare v_business_id uuid;v_customer_id uuid;v_booking_id uuid;v_booking_number bigint;v_total_cents integer:=0;v_count integer;v_item record;v_reserved integer;v_buffer integer:=60;v_timezone text:='America/Phoenix';v_start timestamptz;v_end timestamptz;v_days integer;v_additional integer;v_type text;v_hours integer;v_allow_multi boolean;v_max_days integer;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Please choose at least one rental item.';end if;
 create temporary table requested_rental_items(inventory_item_id uuid primary key,quantity integer not null) on commit drop;
 begin insert into requested_rental_items select (entry->>'inventoryItemId')::uuid,(entry->>'quantity')::integer from jsonb_array_elements(p_items) entry;exception when others then raise exception 'The reservation contains an invalid item or quantity.';end;
 select count(*) into v_count from requested_rental_items;if v_count<>jsonb_array_length(p_items) or exists(select 1 from requested_rental_items where quantity<1 or quantity>10000) then raise exception 'The reservation contains an invalid item or quantity.';end if;
 select min(i.business_id::text)::uuid into v_business_id from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id;
 if v_business_id is null or (select count(distinct i.business_id) from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id)<>1 then raise exception 'All rental items must belong to the same business.';end if;
 select coalesce(buffer_minutes,60),coalesce(timezone,'America/Phoenix') into v_buffer,v_timezone from public.booking_settings where business_id=v_business_id;
 v_start:=(p_rental_date::text||' '||p_event_start_time::text)::timestamp at time zone v_timezone;v_end:=(p_rental_end_date::text||' '||p_event_end_time::text)::timestamp at time zone v_timezone;
 if v_end<=v_start then raise exception 'Rental end must be later than the start.';end if;
 if nullif(trim(p_first_name),'') is null or nullif(trim(p_last_name),'') is null or nullif(trim(p_email),'') is null or nullif(trim(p_phone),'') is null or nullif(trim(p_delivery_address),'') is null or nullif(trim(p_delivery_zip),'') is null then raise exception 'Please complete all required fields.';end if;
 if (select count(*) from public.inventory_items i join requested_rental_items r on r.inventory_item_id=i.id where i.active)<>v_count then raise exception 'One or more selected rental items are no longer available.';end if;
 for v_item in select i.*,r.quantity,bs.standard_rental_hours,bs.allow_multi_day_rentals,bs.additional_day_pricing_type,bs.additional_day_discount_percent,bs.additional_day_flat_rate_cents,bs.max_rental_days from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id join public.booking_settings bs on bs.business_id=i.business_id where i.active order by i.id loop
  perform pg_advisory_xact_lock(hashtextextended(v_item.id::text,0));
  if not v_item.allow_quantity and v_item.quantity<>1 then raise exception '% can only be reserved once per booking.',v_item.name;end if;
  if v_item.quantity>v_item.stock_quantity then raise exception 'Only % of % are available in inventory.',v_item.stock_quantity,v_item.name;end if;
  v_hours:=coalesce(v_item.standard_rental_hours_override,v_item.standard_rental_hours);v_allow_multi:=coalesce(v_item.allow_multi_day_override,v_item.allow_multi_day_rentals);v_type:=coalesce(v_item.additional_day_pricing_type_override,v_item.additional_day_pricing_type);v_max_days:=coalesce(v_item.max_rental_days_override,v_item.max_rental_days);
  v_days:=greatest(1,ceil(extract(epoch from(v_end-v_start))/(v_hours*3600.0))::integer);
  if v_days>1 and not v_allow_multi then raise exception '% is limited to one standard rental period.',v_item.name;end if;
  if v_max_days is not null and v_days>v_max_days then raise exception '% is limited to % rental days.',v_item.name,v_max_days;end if;
  if exists(select 1 from public.blocked_dates bd where bd.inventory_item_id=v_item.id and bd.blocked_date between p_rental_date and p_rental_end_date) then raise exception '% is blocked during that rental period.',v_item.name;end if;
  select coalesce(sum(bi.quantity),0)::integer into v_reserved from public.booking_items bi join public.bookings b on b.id=bi.booking_id where bi.inventory_item_id=v_item.id and bi.status in('pending_payment','paid','confirmed') and coalesce(b.rental_starts_at,(bi.rental_date::text||' '||b.event_start_time::text)::timestamp at time zone v_timezone)<v_end+make_interval(mins=>v_buffer) and coalesce(b.rental_ends_at,(bi.rental_date::text||' '||b.event_end_time::text)::timestamp at time zone v_timezone)+make_interval(mins=>v_buffer)>v_start;
  if v_reserved+v_item.quantity>v_item.stock_quantity then raise exception 'Only % of % remain available for that rental period.',greatest(v_item.stock_quantity-v_reserved,0),v_item.name;end if;
  v_additional:=case when v_type='percentage_discount' then round(v_item.daily_price_cents*(100-coalesce(v_item.additional_day_discount_percent_override,v_item.additional_day_discount_percent))/100.0) when v_type='flat_rate' then coalesce(v_item.additional_day_flat_rate_cents_override,v_item.additional_day_flat_rate_cents,v_item.daily_price_cents) else v_item.daily_price_cents end;
  v_total_cents:=v_total_cents+(v_item.daily_price_cents+(v_days-1)*v_additional)*v_item.quantity;
 end loop;
 insert into public.customers(business_id,first_name,last_name,email,phone) values(v_business_id,trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_phone)) on conflict(business_id,(lower(email))) where email is not null and btrim(email)<>'' and is_deleted=false do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,updated_at=now() returning id into v_customer_id;
 insert into public.bookings(business_id,customer_id,status,event_start_time,event_end_time,rental_starts_at,rental_ends_at,delivery_address,delivery_city,delivery_state,delivery_zip,notes,subtotal_cents,tax_cents,total_cents,agreement_accepted_at) values(v_business_id,v_customer_id,'pending_payment',p_event_start_time,p_event_end_time,v_start,v_end,trim(p_delivery_address),trim(p_delivery_city),'AZ',trim(p_delivery_zip),nullif(trim(coalesce(p_notes,'')),''),v_total_cents,0,v_total_cents,now()) returning id,public.bookings.booking_number into v_booking_id,v_booking_number;
 insert into public.booking_items(booking_id,inventory_item_id,rental_date,quantity,unit_price_cents,status,rental_days,base_unit_price_cents,additional_day_unit_price_cents,rental_pricing_type,standard_rental_hours) select v_booking_id,i.id,p_rental_date,r.quantity,i.daily_price_cents+(greatest(1,ceil(extract(epoch from(v_end-v_start))/(coalesce(i.standard_rental_hours_override,bs.standard_rental_hours)*3600.0))::integer)-1)*case when coalesce(i.additional_day_pricing_type_override,bs.additional_day_pricing_type)='percentage_discount' then round(i.daily_price_cents*(100-coalesce(i.additional_day_discount_percent_override,bs.additional_day_discount_percent))/100.0) when coalesce(i.additional_day_pricing_type_override,bs.additional_day_pricing_type)='flat_rate' then coalesce(i.additional_day_flat_rate_cents_override,bs.additional_day_flat_rate_cents,i.daily_price_cents) else i.daily_price_cents end,'pending_payment',greatest(1,ceil(extract(epoch from(v_end-v_start))/(coalesce(i.standard_rental_hours_override,bs.standard_rental_hours)*3600.0))::integer),i.daily_price_cents,case when coalesce(i.additional_day_pricing_type_override,bs.additional_day_pricing_type)='percentage_discount' then round(i.daily_price_cents*(100-coalesce(i.additional_day_discount_percent_override,bs.additional_day_discount_percent))/100.0) when coalesce(i.additional_day_pricing_type_override,bs.additional_day_pricing_type)='flat_rate' then coalesce(i.additional_day_flat_rate_cents_override,bs.additional_day_flat_rate_cents,i.daily_price_cents) else i.daily_price_cents end,coalesce(i.additional_day_pricing_type_override,bs.additional_day_pricing_type),coalesce(i.standard_rental_hours_override,bs.standard_rental_hours) from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id join public.booking_settings bs on bs.business_id=i.business_id;
 return query select v_booking_id,v_booking_number;
end;$$;
revoke all on function public.create_public_booking_quantities_timed(jsonb,date,date,text,text,text,text,time,time,text,text,text,text) from public;
grant execute on function public.create_public_booking_quantities_timed(jsonb,date,date,text,text,text,text,time,time,text,text,text,text) to service_role;
