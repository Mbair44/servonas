-- Customer-facing listings can share the same underlying physical inventory.
create table if not exists public.rental_listing_inventory_requirements (
  business_id uuid not null references public.businesses(id) on delete cascade,
  listing_inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  resource_inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_required integer not null default 1 check (quantity_required between 1 and 10000),
  created_at timestamptz not null default now(),
  primary key (listing_inventory_item_id, resource_inventory_item_id)
);

create index if not exists rental_listing_inventory_requirements_business_idx
  on public.rental_listing_inventory_requirements(business_id, resource_inventory_item_id);

create table if not exists public.booking_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_item_id uuid not null references public.booking_items(id) on delete cascade,
  listing_inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  resource_inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 100000000),
  revenue_allocation_weight numeric(14,4) not null check (revenue_allocation_weight > 0),
  rental_starts_at timestamptz not null,
  rental_ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (booking_item_id, resource_inventory_item_id),
  check (rental_ends_at > rental_starts_at)
);

create index if not exists booking_inventory_reservations_capacity_idx
  on public.booking_inventory_reservations(business_id, resource_inventory_item_id, rental_starts_at, rental_ends_at);
create index if not exists booking_inventory_reservations_booking_idx
  on public.booking_inventory_reservations(booking_id);

create or replace function public.release_rental_inventory_for_canceled_job()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='canceled' and old.status is distinct from new.status then
    update public.bookings set status='cancelled'
    where job_id=new.id and business_id=new.business_id
      and status in('pending_payment','paid','confirmed');
  end if;
  return new;
end;
$$;

drop trigger if exists release_rental_inventory_on_job_cancellation on public.jobs;
create trigger release_rental_inventory_on_job_cancellation
after update of status on public.jobs
for each row execute function public.release_rental_inventory_for_canceled_job();

update public.bookings booking set status='cancelled'
from public.jobs job
where booking.job_id=job.id and booking.business_id=job.business_id and job.status='canceled'
  and booking.status in('pending_payment','paid','confirmed');
create or replace function public.validate_rental_inventory_requirement_tenant()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists (
    select 1 from public.inventory_items listing
    join public.inventory_items resource on resource.id=new.resource_inventory_item_id
    where listing.id=new.listing_inventory_item_id
      and listing.business_id=new.business_id
      and resource.business_id=new.business_id
  ) then
    raise exception 'rental_inventory_requirement_tenant_mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists rental_inventory_requirement_tenant_guard on public.rental_listing_inventory_requirements;
create trigger rental_inventory_requirement_tenant_guard
before insert or update on public.rental_listing_inventory_requirements
for each row execute function public.validate_rental_inventory_requirement_tenant();

create or replace function public.add_default_rental_inventory_requirement()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.business_id is not null then
    insert into public.rental_listing_inventory_requirements(
      business_id, listing_inventory_item_id, resource_inventory_item_id, quantity_required
    ) values (new.business_id, new.id, new.id, 1)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists rental_inventory_default_requirement on public.inventory_items;
create trigger rental_inventory_default_requirement
after insert on public.inventory_items
for each row execute function public.add_default_rental_inventory_requirement();

insert into public.rental_listing_inventory_requirements(
  business_id, listing_inventory_item_id, resource_inventory_item_id, quantity_required
)
select business_id,id,id,1 from public.inventory_items where business_id is not null
on conflict do nothing;

create or replace function public.replace_rental_listing_inventory_requirements(
  p_business_id uuid,
  p_listing_inventory_item_id uuid,
  p_resource_inventory_item_ids uuid[]
) returns void
language plpgsql security definer set search_path=public as $$
declare v_resource_count integer;
begin
  if coalesce(auth.role(),'')<>'service_role'
    and not coalesce(public.is_servonas_platform_admin(),false)
    and not coalesce(public.has_business_role(p_business_id,array['owner','admin']),false) then
    raise exception 'permission_denied';
  end if;
  if not exists(select 1 from public.inventory_items where id=p_listing_inventory_item_id and business_id=p_business_id) then
    raise exception 'rental_listing_not_found';
  end if;
  if p_resource_inventory_item_ids is null or cardinality(p_resource_inventory_item_ids)=0 then
    raise exception 'included_inventory_required';
  end if;
  select count(distinct id) into v_resource_count
  from public.inventory_items
  where business_id=p_business_id and id=any(p_resource_inventory_item_ids);
  if v_resource_count<>cardinality(p_resource_inventory_item_ids) then
    raise exception 'invalid_included_inventory';
  end if;
  delete from public.rental_listing_inventory_requirements
  where business_id=p_business_id and listing_inventory_item_id=p_listing_inventory_item_id;
  insert into public.rental_listing_inventory_requirements(
    business_id,listing_inventory_item_id,resource_inventory_item_id,quantity_required
  )
  select p_business_id,p_listing_inventory_item_id,resource_id,1
  from unnest(p_resource_inventory_item_ids) resource_id;
end;
$$;

revoke all on function public.replace_rental_listing_inventory_requirements(uuid,uuid,uuid[]) from public;
grant execute on function public.replace_rental_listing_inventory_requirements(uuid,uuid,uuid[]) to authenticated;

-- Snapshot all existing reservations against their historical one-to-one resource.
insert into public.booking_inventory_reservations(
  business_id,booking_id,booking_item_id,listing_inventory_item_id,resource_inventory_item_id,
  quantity,revenue_allocation_weight,rental_starts_at,rental_ends_at
)
select
  b.business_id,b.id,bi.id,bi.inventory_item_id,requirement.resource_inventory_item_id,
  bi.quantity*requirement.quantity_required,
  (bi.quantity*requirement.quantity_required)::numeric,
  coalesce(b.rental_starts_at,(bi.rental_date::text||' '||b.event_start_time::text)::timestamp at time zone coalesce(settings.timezone,'America/Phoenix')),
  coalesce(b.rental_ends_at,(bi.rental_date::text||' '||b.event_end_time::text)::timestamp at time zone coalesce(settings.timezone,'America/Phoenix'))
from public.booking_items bi
join public.bookings b on b.id=bi.booking_id
join public.booking_settings settings on settings.business_id=b.business_id
join public.rental_listing_inventory_requirements requirement
  on requirement.listing_inventory_item_id=bi.inventory_item_id
where b.business_id is not null
on conflict (booking_item_id,resource_inventory_item_id) do nothing;

alter table public.rental_listing_inventory_requirements enable row level security;
alter table public.booking_inventory_reservations enable row level security;
create policy "members view rental inventory requirements" on public.rental_listing_inventory_requirements
  for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage rental inventory requirements" on public.rental_listing_inventory_requirements
  for all to authenticated using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members view booking inventory reservations" on public.booking_inventory_reservations
  for select to authenticated using(public.is_business_member(business_id));

create or replace function public.create_public_booking_quantities_timed(
 p_items jsonb,p_rental_date date,p_rental_end_date date,p_first_name text,p_last_name text,
 p_email text,p_phone text,p_event_start_time time,p_event_end_time time,
 p_delivery_address text,p_delivery_city text,p_delivery_zip text,p_notes text default ''
) returns table(booking_id uuid,booking_number bigint)
language plpgsql security definer set search_path=public as $$
declare v_business_id uuid;v_customer_id uuid;v_booking_id uuid;v_booking_number bigint;v_total_cents integer:=0;v_count integer;v_item record;v_resource record;v_reserved integer;v_buffer integer:=60;v_timezone text:='America/Phoenix';v_start timestamptz;v_end timestamptz;v_days integer;v_additional integer;v_type text;v_allow_multi boolean;v_max_days integer;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Please choose at least one rental item.';end if;
 if p_rental_end_date<p_rental_date then raise exception 'The last rental day cannot be before the first rental day.';end if;
 create temporary table requested_rental_items(inventory_item_id uuid primary key,quantity integer not null) on commit drop;
 begin insert into requested_rental_items select (entry->>'inventoryItemId')::uuid,(entry->>'quantity')::integer from jsonb_array_elements(p_items) entry;exception when others then raise exception 'The reservation contains an invalid item or quantity.';end;
 select count(*) into v_count from requested_rental_items;if v_count<>jsonb_array_length(p_items) or exists(select 1 from requested_rental_items where quantity<1 or quantity>10000) then raise exception 'The reservation contains an invalid item or quantity.';end if;
 select min(i.business_id::text)::uuid into v_business_id from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id;
 if v_business_id is null or (select count(distinct i.business_id) from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id)<>1 then raise exception 'All rental items must belong to the same business.';end if;
 select coalesce(buffer_minutes,60),coalesce(timezone,'America/Phoenix') into v_buffer,v_timezone from public.booking_settings where business_id=v_business_id;
 v_start:=(p_rental_date::text||' 00:00:00')::timestamp at time zone v_timezone;v_end:=(p_rental_end_date::text||' 23:59:00')::timestamp at time zone v_timezone;
 if v_end<=v_start then raise exception 'Rental end must be later than the start.';end if;
 v_days:=(p_rental_end_date-p_rental_date)+1;
 if nullif(trim(p_first_name),'') is null or nullif(trim(p_last_name),'') is null or nullif(trim(p_email),'') is null or nullif(trim(p_phone),'') is null or nullif(trim(p_delivery_address),'') is null or nullif(trim(p_delivery_zip),'') is null then raise exception 'Please complete all required fields.';end if;
 if (select count(*) from public.inventory_items i join requested_rental_items r on r.inventory_item_id=i.id where i.active)<>v_count then raise exception 'One or more selected rental items are no longer available.';end if;
 if exists(
   select 1 from requested_rental_items requested
   left join public.rental_listing_inventory_requirements requirement on requirement.listing_inventory_item_id=requested.inventory_item_id
   where requirement.listing_inventory_item_id is null
 ) then raise exception 'One or more selected rentals do not have included inventory configured.';end if;
 if exists(
   select 1 from requested_rental_items requested
   join public.rental_listing_inventory_requirements requirement on requirement.listing_inventory_item_id=requested.inventory_item_id
   group by requirement.resource_inventory_item_id having count(distinct requested.inventory_item_id)>1
 ) then raise exception 'These rentals use some of the same equipment. Please choose either the combo or the individual item.';end if;
 if exists(select 1 from public.blocked_dates blocked join requested_rental_items requested on requested.inventory_item_id=blocked.inventory_item_id where blocked.blocked_date between p_rental_date and p_rental_end_date) then raise exception 'One or more selected rentals are blocked during that rental period.';end if;
 create temporary table requested_inventory_resources on commit drop as
 select requirement.resource_inventory_item_id,
   sum(requested.quantity*requirement.quantity_required)::integer requested_quantity
 from requested_rental_items requested
 join public.rental_listing_inventory_requirements requirement on requirement.listing_inventory_item_id=requested.inventory_item_id
 group by requirement.resource_inventory_item_id;
 for v_resource in
   select resource.id,resource.name,resource.stock_quantity,requested.requested_quantity
   from requested_inventory_resources requested
   join public.inventory_items resource on resource.id=requested.resource_inventory_item_id
   where resource.business_id=v_business_id order by resource.id
 loop
  perform pg_advisory_xact_lock(hashtextextended(v_resource.id::text,0));
  if exists(select 1 from public.blocked_dates where inventory_item_id=v_resource.id and blocked_date between p_rental_date and p_rental_end_date) then raise exception '% is blocked during that rental period.',v_resource.name;end if;
  select coalesce(sum(reservation.quantity),0)::integer into v_reserved
  from public.booking_inventory_reservations reservation
  join public.bookings booking on booking.id=reservation.booking_id
  where reservation.resource_inventory_item_id=v_resource.id
    and booking.status in('pending_payment','paid','confirmed')
    and reservation.rental_starts_at<v_end+make_interval(mins=>v_buffer)
    and reservation.rental_ends_at+make_interval(mins=>v_buffer)>v_start;
  if v_reserved+v_resource.requested_quantity>v_resource.stock_quantity then raise exception '% is already reserved for that rental period.',v_resource.name;end if;
 end loop;
 for v_item in select i.*,r.quantity,bs.allow_multi_day_rentals,bs.additional_day_pricing_type,bs.additional_day_discount_percent,bs.additional_day_flat_rate_cents,bs.max_rental_days from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id join public.booking_settings bs on bs.business_id=i.business_id where i.active order by i.id loop
  if not v_item.allow_quantity and v_item.quantity<>1 then raise exception '% can only be reserved once per booking.',v_item.name;end if;
  if v_item.quantity>v_item.stock_quantity then raise exception 'Only % of % are available in inventory.',v_item.stock_quantity,v_item.name;end if;
  v_allow_multi:=coalesce(v_item.allow_multi_day_override,v_item.allow_multi_day_rentals);v_type:=coalesce(v_item.additional_day_pricing_type_override,v_item.additional_day_pricing_type);v_max_days:=coalesce(v_item.max_rental_days_override,v_item.max_rental_days);
  if v_days>1 and not v_allow_multi then raise exception '% is limited to one rental day.',v_item.name;end if;
  if v_max_days is not null and v_days>v_max_days then raise exception '% is limited to % rental days.',v_item.name,v_max_days;end if;
  v_additional:=case when v_type='percentage_discount' then round(v_item.daily_price_cents*(100-coalesce(v_item.additional_day_discount_percent_override,v_item.additional_day_discount_percent))/100.0) when v_type='flat_rate' then coalesce(v_item.additional_day_flat_rate_cents_override,v_item.additional_day_flat_rate_cents,v_item.daily_price_cents) else v_item.daily_price_cents end;
  v_total_cents:=v_total_cents+(v_item.daily_price_cents+(v_days-1)*v_additional)*v_item.quantity;
 end loop;
 insert into public.customers(business_id,first_name,last_name,email,phone) values(v_business_id,trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_phone)) on conflict(business_id,(lower(email))) where email is not null and btrim(email)<>'' and is_deleted=false do update set first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,updated_at=now() returning id into v_customer_id;
 insert into public.bookings(business_id,customer_id,status,event_start_time,event_end_time,rental_starts_at,rental_ends_at,delivery_address,delivery_city,delivery_state,delivery_zip,notes,subtotal_cents,tax_cents,total_cents,agreement_accepted_at) values(v_business_id,v_customer_id,'pending_payment',p_event_start_time,p_event_end_time,v_start,v_end,trim(p_delivery_address),trim(p_delivery_city),'AZ',trim(p_delivery_zip),nullif(trim(coalesce(p_notes,'')),''),v_total_cents,0,v_total_cents,now()) returning id,public.bookings.booking_number into v_booking_id,v_booking_number;
 insert into public.booking_items(booking_id,inventory_item_id,rental_date,quantity,unit_price_cents,status,rental_days,base_unit_price_cents,additional_day_unit_price_cents,rental_pricing_type,standard_rental_hours) select v_booking_id,i.id,p_rental_date,r.quantity,i.daily_price_cents+(v_days-1)*case when coalesce(i.additional_day_pricing_type_override,bs.additional_day_pricing_type)='percentage_discount' then round(i.daily_price_cents*(100-coalesce(i.additional_day_discount_percent_override,bs.additional_day_discount_percent))/100.0) when coalesce(i.additional_day_pricing_type_override,bs.additional_day_pricing_type)='flat_rate' then coalesce(i.additional_day_flat_rate_cents_override,bs.additional_day_flat_rate_cents,i.daily_price_cents) else i.daily_price_cents end,'pending_payment',v_days,i.daily_price_cents,case when coalesce(i.additional_day_pricing_type_override,bs.additional_day_pricing_type)='percentage_discount' then round(i.daily_price_cents*(100-coalesce(i.additional_day_discount_percent_override,bs.additional_day_discount_percent))/100.0) when coalesce(i.additional_day_pricing_type_override,bs.additional_day_pricing_type)='flat_rate' then coalesce(i.additional_day_flat_rate_cents_override,bs.additional_day_flat_rate_cents,i.daily_price_cents) else i.daily_price_cents end,coalesce(i.additional_day_pricing_type_override,bs.additional_day_pricing_type),coalesce(i.standard_rental_hours_override,bs.standard_rental_hours) from requested_rental_items r join public.inventory_items i on i.id=r.inventory_item_id join public.booking_settings bs on bs.business_id=i.business_id;
 insert into public.booking_inventory_reservations(business_id,booking_id,booking_item_id,listing_inventory_item_id,resource_inventory_item_id,quantity,revenue_allocation_weight,rental_starts_at,rental_ends_at)
 select v_business_id,v_booking_id,booking_item.id,booking_item.inventory_item_id,requirement.resource_inventory_item_id,booking_item.quantity*requirement.quantity_required,(booking_item.quantity*requirement.quantity_required)::numeric,v_start,v_end
 from public.booking_items booking_item
 join public.rental_listing_inventory_requirements requirement on requirement.listing_inventory_item_id=booking_item.inventory_item_id
 where booking_item.booking_id=v_booking_id;
 return query select v_booking_id,v_booking_number;
end;$$;

revoke all on function public.create_public_booking_quantities_timed(jsonb,date,date,text,text,text,text,time,time,text,text,text,text) from public;
grant execute on function public.create_public_booking_quantities_timed(jsonb,date,date,text,text,text,text,time,time,text,text,text,text) to service_role;

-- Attribute each completed listing line across its reserved resources exactly once.
create or replace function public.rental_inventory_performance(p_business_id uuid)
returns table(inventory_item_id uuid,lifetime_revenue_cents bigint,paid_rentals bigint)
language sql stable security invoker set search_path=public as $$
  with completed_lines as (
    select bi.id booking_item_id,b.id booking_id,b.job_id,
      greatest(coalesce(bi.unit_price_cents,0),0)::numeric*greatest(coalesce(bi.quantity,0),0) item_gross_cents,
      greatest(coalesce(b.discount_cents,0),0)::numeric booking_discount_cents,
      greatest(coalesce(b.amount_paid_cents,0)-coalesce(b.refunded_cents,0),0)::numeric booking_collected_cents,
      greatest(coalesce(b.total_cents,0),0)::numeric booking_total_cents
    from public.bookings b join public.jobs j on j.id=b.job_id and j.business_id=b.business_id and j.status='completed' and not j.is_deleted
    join public.booking_items bi on bi.booking_id=b.id
    where b.business_id=p_business_id and b.status not in('pending_payment','expired','cancelled','refunded') and bi.status not in('pending_payment','expired','cancelled','refunded')
  ), booking_totals as (
    select booking_id,sum(item_gross_cents)::numeric rental_gross_cents from completed_lines group by booking_id
  ), invoice_collections as (
    select job_id,greatest(sum(coalesce(amount_paid_cents,0)-coalesce(amount_refunded_cents,0)),0)::numeric collected_cents,greatest(sum(coalesce(grand_total_cents,0)),0)::numeric total_cents
    from public.invoices where business_id=p_business_id and not is_deleted group by job_id
  ), recognized_lines as (
    select line.booking_item_id,line.booking_id,round(case when totals.rental_gross_cents<=0 then 0 else
      line.item_gross_cents/totals.rental_gross_cents*greatest(totals.rental_gross_cents-least(line.booking_discount_cents,totals.rental_gross_cents),0)*
      case when greatest(coalesce(invoice.collected_cents,line.booking_collected_cents),0)<=0 or greatest(coalesce(invoice.total_cents,line.booking_total_cents),0)<=0 then 0
      else least(greatest(coalesce(invoice.collected_cents,line.booking_collected_cents),0)/greatest(coalesce(invoice.total_cents,line.booking_total_cents),1),1) end end)::bigint recognized_revenue_cents
    from completed_lines line join booking_totals totals using(booking_id) left join invoice_collections invoice on invoice.job_id=line.job_id
  ), resource_allocations as (
    select recognized.booking_id,reservation.resource_inventory_item_id,
      round(recognized.recognized_revenue_cents*reservation.revenue_allocation_weight/nullif(sum(reservation.revenue_allocation_weight) over(partition by reservation.booking_item_id),0))::bigint resource_revenue_cents
    from recognized_lines recognized join public.booking_inventory_reservations reservation on reservation.booking_item_id=recognized.booking_item_id
  )
  select resource_inventory_item_id,coalesce(sum(resource_revenue_cents),0)::bigint,
    count(distinct booking_id) filter(where resource_revenue_cents>0)::bigint
  from resource_allocations group by resource_inventory_item_id;
$$;

revoke all on function public.rental_inventory_performance(uuid) from public;
grant execute on function public.rental_inventory_performance(uuid) to authenticated;

comment on table public.rental_listing_inventory_requirements is 'Physical inventory pools required by each customer-facing rental listing.';
comment on table public.booking_inventory_reservations is 'Immutable physical-resource reservation and revenue-allocation snapshots for rental bookings.';
