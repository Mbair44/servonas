begin;

create or replace function public.swap_booking_rental_item(
  p_business_id uuid,
  p_job_id uuid,
  p_booking_item_id uuid,
  p_new_inventory_item_id uuid
) returns table(old_inventory_item_id uuid,new_inventory_item_id uuid)
language plpgsql security definer set search_path=public as $$
declare
  v_booking public.bookings%rowtype;
  v_item public.booking_items%rowtype;
  v_new_item public.inventory_items%rowtype;
  v_resource record;
  v_reserved integer;
  v_buffer integer:=60;
  v_timezone text:='America/Phoenix';
  v_start timestamptz;
  v_end timestamptz;
  v_end_date date;
  v_allow_multi boolean;
  v_max_days integer;
  v_old_item_name text;
begin
  if coalesce(auth.role(),'')<>'service_role'
    and not coalesce(public.is_servonas_platform_admin(),false)
    and not coalesce(public.has_business_role(p_business_id,array['owner','admin','manager']),false) then
    raise exception 'permission_denied' using errcode='42501';
  end if;

  select booking.* into v_booking from public.bookings booking
  where booking.business_id=p_business_id and booking.job_id=p_job_id
  for update;
  if not found then raise exception 'linked_booking_not_found';end if;
  if v_booking.status not in('pending_payment','paid','confirmed') then raise exception 'booking_cannot_be_changed';end if;

  select item.* into v_item from public.booking_items item
  where item.id=p_booking_item_id and item.booking_id=v_booking.id
  for update;
  if not found then raise exception 'booking_item_not_found';end if;
  select inventory.name into v_old_item_name from public.inventory_items inventory where inventory.id=v_item.inventory_item_id;
  if v_item.inventory_item_id=p_new_inventory_item_id then
    return query select v_item.inventory_item_id,p_new_inventory_item_id;
    return;
  end if;

  select inventory.* into v_new_item from public.inventory_items inventory
  where inventory.id=p_new_inventory_item_id and inventory.business_id=p_business_id and inventory.active=true;
  if not found then raise exception 'replacement_rental_not_found';end if;
  if not v_new_item.allow_quantity and v_item.quantity<>1 then raise exception 'replacement_quantity_not_allowed';end if;

  select coalesce(settings.buffer_minutes,60),coalesce(settings.timezone,'America/Phoenix'),
    coalesce(v_new_item.allow_multi_day_override,settings.allow_multi_day_rentals),
    coalesce(v_new_item.max_rental_days_override,settings.max_rental_days)
  into v_buffer,v_timezone,v_allow_multi,v_max_days
  from public.booking_settings settings where settings.business_id=p_business_id;

  select coalesce(min(reservation.rental_starts_at),v_booking.rental_starts_at),
    coalesce(max(reservation.rental_ends_at),v_booking.rental_ends_at)
  into v_start,v_end from public.booking_inventory_reservations reservation
  where reservation.booking_item_id=v_item.id;
  if v_start is null or v_end is null or v_end<=v_start then raise exception 'booking_rental_period_missing';end if;
  v_end_date:=(v_end at time zone v_timezone)::date;

  if coalesce(v_item.rental_days,1)>1 and not coalesce(v_allow_multi,false) then raise exception 'replacement_multi_day_not_allowed';end if;
  if v_max_days is not null and coalesce(v_item.rental_days,1)>v_max_days then raise exception 'replacement_max_days_exceeded';end if;
  if not exists(select 1 from public.rental_listing_inventory_requirements requirement where requirement.business_id=p_business_id and requirement.listing_inventory_item_id=p_new_inventory_item_id) then
    raise exception 'replacement_inventory_not_configured';
  end if;

  -- Lock the old and replacement physical resources in one stable order. Any error
  -- below rolls the transaction back, preserving the old reservation.
  for v_resource in
    select distinct resource_id from (
      select reservation.resource_inventory_item_id resource_id from public.booking_inventory_reservations reservation where reservation.booking_item_id=v_item.id
      union
      select requirement.resource_inventory_item_id from public.rental_listing_inventory_requirements requirement where requirement.business_id=p_business_id and requirement.listing_inventory_item_id=p_new_inventory_item_id
    ) resources order by resource_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_resource.resource_id::text,0));
  end loop;

  if exists(select 1 from public.blocked_dates blocked where blocked.business_id=p_business_id and blocked.inventory_item_id=p_new_inventory_item_id and blocked.blocked_date between v_item.rental_date and v_end_date) then
    raise exception 'replacement_rental_blocked';
  end if;

  for v_resource in
    select resource.id,resource.name,resource.stock_quantity,v_item.quantity*requirement.quantity_required requested_quantity
    from public.rental_listing_inventory_requirements requirement
    join public.inventory_items resource on resource.id=requirement.resource_inventory_item_id and resource.business_id=p_business_id and resource.active=true
    where requirement.business_id=p_business_id and requirement.listing_inventory_item_id=p_new_inventory_item_id
    order by resource.id
  loop
    if exists(select 1 from public.blocked_dates blocked where blocked.business_id=p_business_id and blocked.inventory_item_id=v_resource.id and blocked.blocked_date between v_item.rental_date and v_end_date) then
      raise exception '% is blocked during that rental period.',v_resource.name;
    end if;
    select coalesce(sum(reservation.quantity),0)::integer into v_reserved
    from public.booking_inventory_reservations reservation
    join public.bookings booking on booking.id=reservation.booking_id
    where reservation.business_id=p_business_id
      and reservation.resource_inventory_item_id=v_resource.id
      and reservation.booking_item_id<>v_item.id
      and booking.status in('pending_payment','paid','confirmed')
      and reservation.rental_starts_at<v_end+make_interval(mins=>v_buffer)
      and reservation.rental_ends_at+make_interval(mins=>v_buffer)>v_start;
    if v_reserved+v_resource.requested_quantity>v_resource.stock_quantity then
      raise exception '% is already reserved for that rental period.',v_resource.name;
    end if;
  end loop;

  if (select count(*) from public.rental_listing_inventory_requirements requirement join public.inventory_items resource on resource.id=requirement.resource_inventory_item_id and resource.business_id=p_business_id and resource.active=true where requirement.business_id=p_business_id and requirement.listing_inventory_item_id=p_new_inventory_item_id)
    <>(select count(*) from public.rental_listing_inventory_requirements requirement where requirement.business_id=p_business_id and requirement.listing_inventory_item_id=p_new_inventory_item_id) then
    raise exception 'replacement_inventory_not_configured';
  end if;

  delete from public.booking_inventory_reservations where booking_item_id=v_item.id;
  update public.booking_items set inventory_item_id=p_new_inventory_item_id where id=v_item.id;
  insert into public.booking_inventory_reservations(
    business_id,booking_id,booking_item_id,listing_inventory_item_id,resource_inventory_item_id,
    quantity,revenue_allocation_weight,rental_starts_at,rental_ends_at
  )
  select p_business_id,v_booking.id,v_item.id,p_new_inventory_item_id,requirement.resource_inventory_item_id,
    v_item.quantity*requirement.quantity_required,(v_item.quantity*requirement.quantity_required)::numeric,v_start,v_end
  from public.rental_listing_inventory_requirements requirement
  where requirement.business_id=p_business_id and requirement.listing_inventory_item_id=p_new_inventory_item_id;

  -- Jobs intentionally use the linked booking as their item reference. Keep the
  -- human-readable snapshots current without overwriting a custom job title.
  update public.jobs set
    title=case when title=v_old_item_name then v_new_item.name else title end,
    description=case when description is null or v_old_item_name is null then description else replace(description,v_old_item_name,v_new_item.name) end
  where id=p_job_id and business_id=p_business_id;

  return query select v_item.inventory_item_id,p_new_inventory_item_id;
end;
$$;

revoke all on function public.swap_booking_rental_item(uuid,uuid,uuid,uuid) from public;
grant execute on function public.swap_booking_rental_item(uuid,uuid,uuid,uuid) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
