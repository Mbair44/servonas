-- Service-role-only, all-or-nothing addition of rental listings to an existing booking.
-- Pricing inputs are deliberately limited to the existing booking window and server-calculated
-- option/line snapshots. Callers may not provide a price, tax, or availability decision.

alter table public.booking_change_audit drop constraint if exists booking_change_audit_change_source_check;
alter table public.booking_change_audit add constraint booking_change_audit_change_source_check
  check (change_source in ('customer','customer_manage_booking','staff','system'));

create or replace function public.add_rental_items_to_booking(
  p_business_id uuid,
  p_booking_id uuid,
  p_items jsonb,
  p_discount_cents integer,
  p_discount_snapshot jsonb,
  p_idempotency_key text,
  p_change_source text default 'customer_manage_booking'
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_booking public.bookings%rowtype;
  v_timezone text := 'America/Phoenix'; v_buffer integer := 60;
  v_start timestamptz; v_end timestamptz; v_days integer;
  v_item record; v_resource record; v_reserved integer; v_subtotal integer;
  v_discount integer; v_total integer; v_balance integer; v_option_selections jsonb;
  v_option_adjustment integer; v_item_id uuid; v_booking_item_id uuid;
  v_old jsonb; v_added jsonb := '[]'::jsonb; v_added_summary text := ''; v_result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Choose at least one rental item.';
  end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'An idempotency key is required.'; end if;
  if p_change_source not in ('customer','customer_manage_booking','staff','system') then raise exception 'Invalid change source.'; end if;

  select * into v_booking from public.bookings where id=p_booking_id and business_id=p_business_id for update;
  if not found then raise exception 'Booking not found.'; end if;
  if v_booking.status not in ('pending_payment','paid','confirmed') then raise exception 'This booking cannot be amended.'; end if;

  -- A replay returns the current authoritative state and never adds lines a second time.
  if exists(select 1 from public.booking_change_audit where booking_id=p_booking_id
    and change_type='rental_items_added' and new_values->>'idempotency_key'=p_idempotency_key) then
    select jsonb_build_object('booking',to_jsonb(b),'items',coalesce(jsonb_agg(to_jsonb(bi) order by bi.created_at),'[]'::jsonb),'idempotent',true)
      into v_result from public.bookings b left join public.booking_items bi on bi.booking_id=b.id where b.id=p_booking_id group by b.id;
    return v_result;
  end if;

  select coalesce(timezone,'America/Phoenix'),coalesce(buffer_minutes,60) into v_timezone,v_buffer
    from public.booking_settings where business_id=p_business_id;
  v_start:=v_booking.rental_starts_at; v_end:=v_booking.rental_ends_at;
  if v_start is null or v_end is null or v_end<=v_start then raise exception 'The booking rental window is invalid.'; end if;
  v_days:=((v_end at time zone v_timezone)::date-(v_start at time zone v_timezone)::date)+1;

  create temporary table amend_requested_items(inventory_item_id uuid primary key, quantity integer not null, selections jsonb not null) on commit drop;
  begin
    insert into amend_requested_items
      select (entry->>'inventoryItemId')::uuid,(entry->>'quantity')::integer,coalesce(entry->'options','[]'::jsonb)
      from jsonb_array_elements(p_items) entry;
  exception when others then raise exception 'The requested rental items are invalid.'; end;
  if (select count(*) from amend_requested_items)<>jsonb_array_length(p_items)
    or exists(select 1 from amend_requested_items where quantity<1 or quantity>10000 or jsonb_typeof(selections)<>'array') then
    raise exception 'The requested rental items are invalid.';
  end if;
  if exists(select 1 from amend_requested_items r left join public.inventory_items i on i.id=r.inventory_item_id
    where i.id is null or i.business_id<>p_business_id or not i.active) then raise exception 'One or more selected rentals are no longer available.'; end if;
  if exists(select 1 from amend_requested_items r left join public.rental_listing_inventory_requirements q on q.listing_inventory_item_id=r.inventory_item_id
    where q.listing_inventory_item_id is null) then raise exception 'One or more selected rentals do not have included inventory configured.'; end if;

  -- Lock every physical pool first, in a deterministic order, before checking availability.
  create temporary table amend_requested_resources on commit drop as
    select q.resource_inventory_item_id,sum(r.quantity*q.quantity_required)::integer requested_quantity
    from amend_requested_items r join public.rental_listing_inventory_requirements q on q.listing_inventory_item_id=r.inventory_item_id
    group by q.resource_inventory_item_id;
  for v_resource in select i.id,i.name,i.stock_quantity,r.requested_quantity from amend_requested_resources r
    join public.inventory_items i on i.id=r.resource_inventory_item_id order by i.id loop
    perform pg_advisory_xact_lock(hashtextextended(v_resource.id::text,0));
    if exists(select 1 from public.blocked_dates where inventory_item_id=v_resource.id
      and blocked_date between (v_start at time zone v_timezone)::date and (v_end at time zone v_timezone)::date) then
      raise exception '% is blocked during that rental period.',v_resource.name;
    end if;
    select coalesce(sum(reservation.quantity),0)::integer into v_reserved
      from public.booking_inventory_reservations reservation join public.bookings b on b.id=reservation.booking_id
      where reservation.resource_inventory_item_id=v_resource.id and reservation.booking_id<>p_booking_id
        and b.status in ('pending_payment','paid','confirmed')
        and reservation.rental_starts_at<v_end+make_interval(mins=>v_buffer)
        and reservation.rental_ends_at+make_interval(mins=>v_buffer)>v_start;
    -- Reservations already on this booking also consume the shared physical pool.
    select v_reserved+coalesce(sum(quantity),0)::integer into v_reserved from public.booking_inventory_reservations
      where booking_id=p_booking_id and resource_inventory_item_id=v_resource.id
        and rental_starts_at<v_end+make_interval(mins=>v_buffer) and rental_ends_at+make_interval(mins=>v_buffer)>v_start;
    if v_reserved+v_resource.requested_quantity>v_resource.stock_quantity then raise exception '% is already reserved for that rental period.',v_resource.name; end if;
  end loop;

  v_old:=jsonb_build_object('subtotal_cents',v_booking.subtotal_cents,'discount_cents',v_booking.discount_cents,'tax_cents',v_booking.tax_cents,'total_cents',v_booking.total_cents,'balance_due_cents',v_booking.balance_due_cents);
  for v_item in select i.*,r.quantity,r.selections,bs.allow_multi_day_rentals,bs.additional_day_pricing_type,bs.additional_day_discount_percent,bs.additional_day_flat_rate_cents,bs.max_rental_days,bs.standard_rental_hours
    from amend_requested_items r join public.inventory_items i on i.id=r.inventory_item_id join public.booking_settings bs on bs.business_id=i.business_id order by i.id loop
    if not v_item.allow_quantity and v_item.quantity<>1 then raise exception '% can only be reserved once per booking.',v_item.name; end if;
    if v_item.quantity>v_item.stock_quantity then raise exception 'Only % of % are in inventory.',v_item.stock_quantity,v_item.name; end if;
    if v_days>1 and not coalesce(v_item.allow_multi_day_override,v_item.allow_multi_day_rentals) then raise exception '% is limited to one rental day.',v_item.name; end if;
    if coalesce(v_item.max_rental_days_override,v_item.max_rental_days) is not null and v_days>coalesce(v_item.max_rental_days_override,v_item.max_rental_days) then raise exception '% exceeds its maximum rental period.',v_item.name; end if;

    -- The submitted option IDs are only selectors; labels and price adjustments are rebuilt from tenant data.
    if exists(select 1 from public.inventory_item_booking_options o where o.inventory_item_id=v_item.id and o.required
      and (select count(*) from jsonb_array_elements(v_item.selections) s where s->>'optionId'=o.id::text)<>1) then raise exception 'Choose all required booking options for %.',v_item.name; end if;
    if exists(select 1 from jsonb_array_elements(v_item.selections) s
      left join public.inventory_item_booking_options o on o.id=(s->>'optionId')::uuid and o.inventory_item_id=v_item.id
      left join public.inventory_item_booking_option_choices c on c.id=(s->>'choiceId')::uuid and c.option_id=o.id
      where o.id is null or c.id is null) then raise exception 'Choose valid booking options for %.',v_item.name; end if;
    if exists(select 1 from jsonb_array_elements(v_item.selections) s group by s->>'optionId' having count(*)<>1) then raise exception 'Choose only one value for each booking option.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('option_id',o.id,'option_name',o.name,'choice_id',c.id,'choice_label',c.label,'price_adjustment_cents',c.price_adjustment_cents) order by o.sort_order,c.sort_order),'[]'::jsonb),coalesce(sum(c.price_adjustment_cents),0)::integer
      into v_option_selections,v_option_adjustment from jsonb_array_elements(v_item.selections) s
      join public.inventory_item_booking_options o on o.id=(s->>'optionId')::uuid
      join public.inventory_item_booking_option_choices c on c.id=(s->>'choiceId')::uuid and c.option_id=o.id;

    insert into public.booking_items(booking_id,inventory_item_id,rental_date,quantity,unit_price_cents,status,rental_days,base_unit_price_cents,additional_day_unit_price_cents,rental_pricing_type,standard_rental_hours,option_selections,option_adjustment_cents,standard_rental_hours_snapshot)
      values(p_booking_id,v_item.id,(v_start at time zone v_timezone)::date,v_item.quantity,
        v_item.daily_price_cents+(v_days-1)*case when coalesce(v_item.additional_day_pricing_type_override,v_item.additional_day_pricing_type)='percentage_discount' then round(v_item.daily_price_cents*(100-coalesce(v_item.additional_day_discount_percent_override,v_item.additional_day_discount_percent))/100.0)
          when coalesce(v_item.additional_day_pricing_type_override,v_item.additional_day_pricing_type)='flat_rate' then coalesce(v_item.additional_day_flat_rate_cents_override,v_item.additional_day_flat_rate_cents,v_item.daily_price_cents) else v_item.daily_price_cents end,
        v_booking.status,v_days,v_item.daily_price_cents,
        case when coalesce(v_item.additional_day_pricing_type_override,v_item.additional_day_pricing_type)='percentage_discount' then round(v_item.daily_price_cents*(100-coalesce(v_item.additional_day_discount_percent_override,v_item.additional_day_discount_percent))/100.0)
          when coalesce(v_item.additional_day_pricing_type_override,v_item.additional_day_pricing_type)='flat_rate' then coalesce(v_item.additional_day_flat_rate_cents_override,v_item.additional_day_flat_rate_cents,v_item.daily_price_cents) else v_item.daily_price_cents end,
        coalesce(v_item.additional_day_pricing_type_override,v_item.additional_day_pricing_type),coalesce(v_item.standard_rental_hours_override,v_item.standard_rental_hours),v_option_selections,v_option_adjustment,coalesce(v_item.standard_rental_hours_override,v_item.standard_rental_hours)) returning id into v_booking_item_id;
    insert into public.booking_inventory_reservations(business_id,booking_id,booking_item_id,listing_inventory_item_id,resource_inventory_item_id,quantity,revenue_allocation_weight,rental_starts_at,rental_ends_at)
      select p_business_id,p_booking_id,v_booking_item_id,v_item.id,q.resource_inventory_item_id,v_item.quantity*q.quantity_required,(v_item.quantity*q.quantity_required)::numeric,v_start,v_end
      from public.rental_listing_inventory_requirements q where q.listing_inventory_item_id=v_item.id;
    v_added:=v_added||jsonb_build_array(jsonb_build_object('booking_item_id',v_booking_item_id,'inventory_item_id',v_item.id,'quantity',v_item.quantity));
    v_added_summary:=concat_ws(', ',nullif(v_added_summary,''),format('%s × %s',v_item.name,v_item.quantity));
  end loop;

  select coalesce(sum(unit_price_cents*quantity+option_adjustment_cents*quantity+duration_adjustment_cents*quantity+operator_charge_cents),0)::integer into v_subtotal from public.booking_items where booking_id=p_booking_id;
  v_discount:=greatest(0,least(coalesce(p_discount_cents,0),v_subtotal));
  v_total:=greatest(0,v_subtotal-v_discount)+coalesce(v_booking.delivery_fee_cents,0)+coalesce(v_booking.tax_cents,0);
  v_balance:=v_total-coalesce(v_booking.amount_paid_cents,0);
  update public.bookings set subtotal_cents=v_subtotal,discount_cents=v_discount,discount_snapshot=p_discount_snapshot,total_cents=v_total,balance_due_cents=v_balance,updated_at=now() where id=p_booking_id;
  -- Preserve staff-written job details while exposing the newly linked rental lines to technicians.
  update public.jobs set subtotal=(v_subtotal+coalesce(v_booking.delivery_fee_cents,0))/100.0,tax_amount=coalesce(v_booking.tax_cents,0)/100.0,discount_amount=v_discount/100.0,
    description=concat_ws(E'\n',nullif(description,''),format('Added rental items: %s',v_added_summary)),updated_at=now()
    where id=v_booking.job_id and business_id=p_business_id;
  insert into public.booking_change_audit(booking_id,business_id,change_source,change_type,old_values,new_values,resulting_total_cents,resulting_balance_due_cents)
    values(p_booking_id,p_business_id,p_change_source,'rental_items_added',v_old,jsonb_build_object('idempotency_key',p_idempotency_key,'added_items',v_added,'subtotal_cents',v_subtotal,'discount_cents',v_discount,'tax_cents',coalesce(v_booking.tax_cents,0),'total_cents',v_total,'balance_due_cents',v_balance),v_total,v_balance);
  select jsonb_build_object('booking',to_jsonb(b),'items',coalesce(jsonb_agg(to_jsonb(bi) order by bi.created_at),'[]'::jsonb),'idempotent',false)
    into v_result from public.bookings b left join public.booking_items bi on bi.booking_id=b.id where b.id=p_booking_id group by b.id;
  return v_result;
end;
$$;

revoke all on function public.add_rental_items_to_booking(uuid,uuid,jsonb,integer,jsonb,text,text) from public;
grant execute on function public.add_rental_items_to_booking(uuid,uuid,jsonb,integer,jsonb,text,text) to service_role;
