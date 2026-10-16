-- Phase 3A: make the existing canonical add-on records usable before a
-- rental booking has been turned into a job.  This migration deliberately
-- does not grant the RPC to public roles; the checkout server remains the
-- only caller.
begin;

alter table public.job_addons alter column job_id drop not null;
alter table public.job_addons add column if not exists origin text not null default 'admin'
  check (origin in ('admin','customer_checkout'));

-- A checkout add-on is unique within a booking/catalog pair.  Admin-created
-- custom lines remain unrestricted and all existing rows are retained.
create unique index if not exists job_addons_customer_checkout_catalog_once
  on public.job_addons(business_id,booking_id,catalog_id)
  where booking_id is not null and catalog_id is not null and origin='customer_checkout';
create index if not exists job_addons_booking_idx
  on public.job_addons(business_id,booking_id,created_at);

-- Existing job audit rows always have a job.  Booking-originated rows can be
-- audited before the asynchronous job is created.
alter table public.job_addon_audit_events alter column job_id drop not null;
alter table public.job_addon_audit_events add column if not exists booking_id uuid
  references public.bookings(id) on delete cascade;
alter table public.job_addon_audit_events drop constraint if exists job_addon_audit_events_subject_check;
alter table public.job_addon_audit_events add constraint job_addon_audit_events_subject_check
  check (job_id is not null or booking_id is not null);
create index if not exists job_addon_audit_events_booking_idx
  on public.job_addon_audit_events(business_id,booking_id,created_at)
  where booking_id is not null;

-- A request key makes a retry of the new checkout path return the same
-- booking. It does not alter the established no-add-on checkout path.
create table if not exists public.customer_addon_checkout_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_key uuid not null,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (business_id,request_key)
);
alter table public.customer_addon_checkout_requests enable row level security;
create policy "members read customer addon checkout requests" on public.customer_addon_checkout_requests
  for select to authenticated using(public.is_business_member(business_id));

-- Enforce tenant-consistent polymorphic associations even for service-role
-- callers. A line must belong to at least a booking or a job and every linked
-- record must belong to the same business.
create or replace function public.enforce_job_addon_association_tenant()
returns trigger language plpgsql set search_path=public as $$
declare v_business_id uuid;
begin
  if new.job_id is null and new.booking_id is null then
    raise exception 'A job add-on must belong to a booking or job.' using errcode='23514';
  end if;
  if new.job_id is not null then
    select business_id into v_business_id from public.jobs where id=new.job_id;
    if v_business_id is null or v_business_id<>new.business_id then
      raise exception 'Job add-on job tenant does not match.' using errcode='23503';
    end if;
  end if;
  if new.booking_id is not null then
    select business_id into v_business_id from public.bookings where id=new.booking_id;
    if v_business_id is null or v_business_id<>new.business_id then
      raise exception 'Job add-on booking tenant does not match.' using errcode='23503';
    end if;
  end if;
  if new.catalog_id is not null then
    select business_id into v_business_id from public.job_addon_catalog where id=new.catalog_id;
    if v_business_id is null or v_business_id<>new.business_id then
      raise exception 'Job add-on catalog tenant does not match.' using errcode='23503';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists job_addons_association_tenant on public.job_addons;
create trigger job_addons_association_tenant before insert or update on public.job_addons
  for each row execute function public.enforce_job_addon_association_tenant();

create or replace function public.create_public_booking_with_customer_addons(
  p_items jsonb,p_rental_date date,p_rental_end_date date,p_first_name text,p_last_name text,
  p_email text,p_phone text,p_event_start_time time,p_event_end_time time,
  p_delivery_address text,p_delivery_city text,p_delivery_zip text,p_notes text default '',
  p_customer_addons jsonb default '[]'::jsonb,p_addon_tax_rate_basis_points integer default 0,
  p_request_key uuid default null
) returns table(booking_id uuid,booking_number bigint)
language plpgsql security definer set search_path=public as $$
declare
  v_business_id uuid; v_created record; v_booking public.bookings%rowtype;
  v_addon record; v_subtotal bigint:=0; v_tax bigint:=0; v_total bigint:=0;
  v_request_booking uuid;
begin
  if p_customer_addons is null or jsonb_typeof(p_customer_addons)<>'array' then
    raise exception 'Customer add-ons must be an array.' using errcode='22023';
  end if;
  if p_addon_tax_rate_basis_points is null or p_addon_tax_rate_basis_points<0 or p_addon_tax_rate_basis_points>100000 then
    raise exception 'Invalid add-on tax rate.' using errcode='22023';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Please choose at least one rental item.' using errcode='22023';
  end if;
  begin
    select min(i.business_id::text)::uuid into v_business_id
    from jsonb_array_elements(p_items) entry
    join public.inventory_items i on i.id=(entry->>'inventoryItemId')::uuid;
  exception when others then
    raise exception 'The reservation contains an invalid item or quantity.' using errcode='22023';
  end;
  if v_business_id is null or (select count(distinct i.business_id)
      from jsonb_array_elements(p_items) entry join public.inventory_items i on i.id=(entry->>'inventoryItemId')::uuid)<>1 then
    raise exception 'All rental items must belong to the same business.' using errcode='22023';
  end if;

  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_business_id::text||':'||p_request_key::text,0));
    select request.booking_id into v_request_booking from public.customer_addon_checkout_requests request
      where request.business_id=v_business_id and request.request_key=p_request_key;
    if v_request_booking is not null then
      select booking.id,booking.booking_number into booking_id,booking_number
        from public.bookings booking where booking.id=v_request_booking;
      return next; return;
    end if;
  end if;

  create temporary table requested_customer_catalog_addons(
    catalog_id uuid primary key, quantity integer not null, tax_cents bigint not null, tax_rate_basis_points integer not null
  ) on commit drop;
  begin
    insert into requested_customer_catalog_addons(catalog_id,quantity,tax_cents,tax_rate_basis_points)
    select (entry->>'catalogId')::uuid,(entry->>'quantity')::integer,coalesce((entry->>'taxCents')::bigint,0),coalesce((entry->>'taxRateBasisPoints')::integer,0)
    from jsonb_array_elements(p_customer_addons) entry;
  exception when others then
    raise exception 'The selected add-ons are invalid.' using errcode='22023';
  end;
  if (select count(*) from requested_customer_catalog_addons)<>jsonb_array_length(p_customer_addons)
     or exists(select 1 from requested_customer_catalog_addons where quantity<1 or quantity>10000 or tax_cents<0 or tax_rate_basis_points<0 or tax_rate_basis_points>100000) then
    raise exception 'The selected add-ons are invalid.' using errcode='22023';
  end if;

  -- Catalog validation happens before reservation creation. Inventory-backed
  -- offers intentionally fail closed until they share the rental-reservation
  -- lock and capacity model.
  if exists (
    select 1 from requested_customer_catalog_addons requested
    left join public.job_addon_catalog catalog on catalog.id=requested.catalog_id
      and catalog.business_id=v_business_id and catalog.is_active
      and catalog.customer_visible and catalog.visibility='public_future'
    where catalog.id is null or catalog.inventory_item_id is not null
      or requested.quantity>catalog.max_customer_quantity
  ) then
    raise exception 'One or more selected add-ons are no longer available.' using errcode='22023';
  end if;
  if exists (
    select 1 from requested_customer_catalog_addons requested
    where exists(select 1 from public.job_addon_applicable_inventory_items applicability where applicability.addon_id=requested.catalog_id)
      and not exists(
        select 1 from public.job_addon_applicable_inventory_items applicability
        join jsonb_array_elements(p_items) item on (item->>'inventoryItemId')::uuid=applicability.inventory_item_id
        where applicability.addon_id=requested.catalog_id
      )
  ) then raise exception 'One or more selected add-ons do not apply to these rentals.' using errcode='22023'; end if;
  if exists (
    select 1 from requested_customer_catalog_addons requested
    join public.job_addon_catalog catalog on catalog.id=requested.catalog_id
    where catalog.compatibility_required and (
      not exists(select 1 from public.job_addon_compatible_inventory_items compatible where compatible.addon_id=requested.catalog_id)
      or exists(
        select 1 from jsonb_array_elements(p_items) item
        where not exists(select 1 from public.job_addon_compatible_inventory_items compatible
          where compatible.addon_id=requested.catalog_id and compatible.inventory_item_id=(item->>'inventoryItemId')::uuid)
      )
    )
  ) then raise exception 'One or more selected add-ons are incompatible with these rentals.' using errcode='22023'; end if;

  select * into v_created from public.create_public_booking_quantities_timed(
    p_items,p_rental_date,p_rental_end_date,p_first_name,p_last_name,p_email,p_phone,
    p_event_start_time,p_event_end_time,p_delivery_address,p_delivery_city,p_delivery_zip,p_notes
  );
  select * into v_booking from public.bookings where id=v_created.booking_id for update;

  for v_addon in
    select catalog.*,requested.quantity,requested.tax_cents,requested.tax_rate_basis_points
    from requested_customer_catalog_addons requested
    join public.job_addon_catalog catalog on catalog.id=requested.catalog_id
    order by catalog.id
  loop
    v_subtotal:=v_addon.quantity*v_addon.default_unit_price_cents;
    v_tax:=case when v_addon.is_taxable then v_addon.tax_cents else 0 end;
    v_total:=v_subtotal+v_tax;
    insert into public.job_addons(
      business_id,job_id,booking_id,catalog_id,origin,name_snapshot,description_snapshot,quantity,
      unit_price_cents,is_taxable,tax_rate_basis_points,subtotal_cents,tax_cents,total_cents
    ) values(
      v_business_id,null,v_booking.id,v_addon.id,'customer_checkout',v_addon.name,v_addon.description,v_addon.quantity,
      v_addon.default_unit_price_cents,v_addon.is_taxable,v_addon.tax_rate_basis_points,v_subtotal,v_tax,v_total
    ) returning id into v_request_booking;
    insert into public.booking_charge_lines(
      business_id,booking_id,job_addon_id,line_type,name_snapshot,description_snapshot,quantity,
      unit_price_cents,subtotal_cents,tax_cents,total_cents
    ) values(
      v_business_id,v_booking.id,v_request_booking,'job_addon',v_addon.name,v_addon.description,v_addon.quantity,
      v_addon.default_unit_price_cents,v_subtotal,v_tax,v_total
    );
    insert into public.job_addon_audit_events(business_id,booking_id,addon_id,action,before_values,after_values)
      values(v_business_id,v_booking.id,v_request_booking,'created','{}'::jsonb,
        jsonb_build_object('origin','customer_checkout','catalog_id',v_addon.id,'quantity',v_addon.quantity,
          'subtotal_cents',v_subtotal,'tax_cents',v_tax,'total_cents',v_total));
    v_booking.subtotal_cents:=coalesce(v_booking.subtotal_cents,0)+v_subtotal;
    v_booking.tax_cents:=coalesce(v_booking.tax_cents,0)+v_tax;
    v_booking.total_cents:=coalesce(v_booking.total_cents,0)+v_total;
    v_booking.balance_due_cents:=greatest(0,v_booking.total_cents-coalesce(v_booking.amount_paid_cents,0));
  end loop;

  update public.bookings set subtotal_cents=v_booking.subtotal_cents,tax_cents=v_booking.tax_cents,
    total_cents=v_booking.total_cents,balance_due_cents=v_booking.balance_due_cents,updated_at=now()
    where id=v_booking.id;
  insert into public.booking_change_audit(
    booking_id,business_id,change_source,change_type,new_values,resulting_total_cents,resulting_balance_due_cents
  ) values(v_booking.id,v_business_id,'customer','customer_checkout_addons',
    jsonb_build_object('request_key',p_request_key,'addons',p_customer_addons),v_booking.total_cents,v_booking.balance_due_cents);
  if p_request_key is not null then
    insert into public.customer_addon_checkout_requests(business_id,request_key,booking_id)
      values(v_business_id,p_request_key,v_booking.id);
  end if;
  booking_id:=v_booking.id; booking_number:=v_created.booking_number; return next;
end $$;

revoke all on function public.create_public_booking_with_customer_addons(
  jsonb,date,date,text,text,text,text,time,time,text,text,text,text,jsonb,integer,uuid
) from public;
grant execute on function public.create_public_booking_with_customer_addons(
  jsonb,date,date,text,text,text,text,time,time,text,text,text,text,jsonb,integer,uuid
) to service_role;

commit;
