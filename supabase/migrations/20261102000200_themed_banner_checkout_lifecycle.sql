-- Customer-selected themed banners are inventory-like: a selection belongs to
-- one rental line, has a server-owned price, and is reserved with the booking.
-- This migration contains no tenant data and is deliberately not applied here.
begin;

alter table public.job_addons add column if not exists booking_item_id uuid
  references public.booking_items(id) on delete set null;
drop index if exists public.job_addons_customer_checkout_catalog_once;
create unique index job_addons_customer_checkout_catalog_once
  on public.job_addons(business_id,booking_id,catalog_id)
  where booking_id is not null and catalog_id is not null and origin='customer_checkout' and booking_item_id is null;
create unique index job_addons_customer_checkout_catalog_item_once
  on public.job_addons(business_id,booking_id,catalog_id,booking_item_id)
  where booking_id is not null and catalog_id is not null and booking_item_id is not null and origin='customer_checkout';

create table public.themed_banner_checkout_requests(
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_key uuid not null,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(business_id,request_key)
);
alter table public.themed_banner_checkout_requests enable row level security;
create policy "members read themed banner checkout requests" on public.themed_banner_checkout_requests
  for select to authenticated using(public.is_business_member(business_id));

-- A cancelled, expired, or failed-payment booking is automatically excluded
-- by themed_banner_available_quantity.  When an active booking changes its
-- rental window, keep its banner holds in lockstep and prevent an oversell.
create or replace function public.sync_themed_banner_reservations_with_booking()
returns trigger language plpgsql set search_path=public as $$
declare v_banner uuid; v_needed integer; v_available integer; v_quantity integer; v_buffer integer;
begin
  if new.rental_starts_at is not distinct from old.rental_starts_at
     and new.rental_ends_at is not distinct from old.rental_ends_at then return new; end if;
  if new.rental_starts_at is null or new.rental_ends_at is null then
    raise exception 'Booking rental window is invalid.' using errcode='22023';
  end if;
  for v_banner in select distinct banner_id from public.booking_themed_banner_reservations where booking_id=new.id order by banner_id loop
    perform pg_advisory_xact_lock(hashtextextended(v_banner::text,0));
    select coalesce(sum(quantity),0)::integer into v_needed from public.booking_themed_banner_reservations where booking_id=new.id and banner_id=v_banner;
    select physical_quantity into v_quantity from public.rental_themed_banners where id=v_banner;
    select coalesce((select buffer_minutes from public.booking_settings where business_id=new.business_id),60) into v_buffer;
    select v_quantity-coalesce(sum(r.quantity),0)::integer into v_available
      from public.booking_themed_banner_reservations r join public.bookings b on b.id=r.booking_id
      where r.banner_id=v_banner and r.booking_id<>new.id and b.status in ('pending_payment','paid','confirmed')
        and r.rental_starts_at<new.rental_ends_at+make_interval(mins=>v_buffer)
        and r.rental_ends_at+make_interval(mins=>v_buffer)>new.rental_starts_at;
    if v_available<v_needed then raise exception 'A selected themed banner is unavailable for the new rental time.' using errcode='23505'; end if;
  end loop;
  update public.booking_themed_banner_reservations set rental_starts_at=new.rental_starts_at,rental_ends_at=new.rental_ends_at,updated_at=now() where booking_id=new.id;
  return new;
end $$;
drop trigger if exists bookings_sync_themed_banner_reservations on public.bookings;
create trigger bookings_sync_themed_banner_reservations before update of rental_starts_at,rental_ends_at on public.bookings
  for each row execute function public.sync_themed_banner_reservations_with_booking();

-- Removing a rental line also removes its linked banner hold and charge. The
-- existing job-addon removal path remains the accounting authority for staff
-- changes; this trigger is the safety net for direct booking-item edits.
create or replace function public.release_themed_banner_on_booking_item_delete()
returns trigger language plpgsql set search_path=public as $$
begin
  delete from public.booking_themed_banner_reservations where booking_item_id=old.id;
  return old;
end $$;
drop trigger if exists booking_items_release_themed_banner on public.booking_items;
create trigger booking_items_release_themed_banner before delete on public.booking_items
  for each row execute function public.release_themed_banner_on_booking_item_delete();

create or replace function public.add_public_themed_banners_to_booking(
  p_booking_id uuid,p_selections jsonb,p_request_key uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_booking public.bookings%rowtype; v_business uuid; v_selection record; v_banner public.rental_themed_banners%rowtype;
  v_catalog public.job_addon_catalog%rowtype; v_booking_item public.booking_items%rowtype; v_addon_id uuid; v_existing uuid;
  v_subtotal bigint:=0; v_tax bigint:=0; v_total bigint:=0; v_request_booking uuid;
begin
  if p_selections is null or jsonb_typeof(p_selections)<>'array' or jsonb_array_length(p_selections)>50 then raise exception 'Themed banner selections are invalid.' using errcode='22023'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found or v_booking.status not in ('pending_payment','paid','confirmed') then raise exception 'This booking can no longer accept themed banners.' using errcode='22023'; end if;
  v_business:=v_booking.business_id;
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_business::text||':'||p_request_key::text,0));
    select booking_id into v_request_booking from public.themed_banner_checkout_requests where business_id=v_business and request_key=p_request_key;
    if v_request_booking is not null then
      if v_request_booking<>p_booking_id then raise exception 'This checkout request belongs to another booking.' using errcode='23505'; end if;
      return jsonb_build_object('booking_id',p_booking_id,'replayed',true);
    end if;
  end if;
  create temporary table requested_themed_banners(banner_id uuid,booking_item_id uuid,tax_cents bigint not null default 0,primary key(banner_id,booking_item_id)) on commit drop;
  begin
    insert into requested_themed_banners(banner_id,booking_item_id,tax_cents)
      select (value->>'bannerId')::uuid,(value->>'bookingItemId')::uuid,coalesce((value->>'taxCents')::bigint,0)
      from jsonb_array_elements(p_selections);
  exception when others then raise exception 'Themed banner selections are invalid.' using errcode='22023'; end;
  if (select count(*) from requested_themed_banners)<>jsonb_array_length(p_selections) or exists(select 1 from requested_themed_banners where tax_cents<0) then raise exception 'Themed banner selections are invalid.' using errcode='22023'; end if;
  -- Lock in deterministic banner-id order. This is what makes last-unit
  -- contention safe even when two checkout requests arrive simultaneously.
  perform pg_advisory_xact_lock(hashtextextended(banner_id::text,0)) from (select distinct banner_id from requested_themed_banners order by banner_id) locked;
  for v_selection in select * from requested_themed_banners order by banner_id,booking_item_id loop
    select * into v_banner from public.rental_themed_banners where id=v_selection.banner_id and business_id=v_business for update;
    select * into v_booking_item from public.booking_items where id=v_selection.booking_item_id and booking_id=p_booking_id;
    select * into v_catalog from public.job_addon_catalog where id=v_banner.catalog_id and business_id=v_business and is_active and customer_visible and visibility='public_future';
    if not found or v_banner.id is null or v_booking_item.id is null or not exists(select 1 from public.rental_themed_banner_compatible_inventory where banner_id=v_banner.id and business_id=v_business and inventory_item_id=v_booking_item.inventory_item_id) then raise exception 'One or more themed banners are no longer available for these rentals.' using errcode='22023'; end if;
    if (v_banner.available_from is not null and v_booking.rental_starts_at::date<v_banner.available_from) or (v_banner.available_until is not null and v_booking.rental_starts_at::date>v_banner.available_until) or public.themed_banner_available_quantity(v_banner.id,v_booking.rental_starts_at,v_booking.rental_ends_at)<1 then raise exception 'A selected themed banner is no longer available.' using errcode='23505'; end if;
    select id into v_existing from public.booking_themed_banner_reservations where booking_id=p_booking_id and banner_id=v_banner.id and booking_item_id=v_booking_item.id;
    if v_existing is not null then continue; end if;
    insert into public.job_addons(business_id,job_id,booking_id,booking_item_id,catalog_id,origin,name_snapshot,description_snapshot,quantity,unit_price_cents,is_taxable,tax_rate_basis_points,subtotal_cents,tax_cents,total_cents)
      values(v_business,null,p_booking_id,v_booking_item.id,v_catalog.id,'customer_checkout',v_catalog.name,v_catalog.description,1,v_catalog.default_unit_price_cents,v_catalog.is_taxable,0,v_catalog.default_unit_price_cents,case when v_catalog.is_taxable then v_selection.tax_cents else 0 end,v_catalog.default_unit_price_cents+case when v_catalog.is_taxable then v_selection.tax_cents else 0 end) returning id into v_addon_id;
    insert into public.booking_charge_lines(business_id,booking_id,job_addon_id,line_type,name_snapshot,description_snapshot,quantity,unit_price_cents,subtotal_cents,tax_cents,total_cents)
      values(v_business,p_booking_id,v_addon_id,'job_addon',v_catalog.name,v_catalog.description,1,v_catalog.default_unit_price_cents,v_catalog.default_unit_price_cents,case when v_catalog.is_taxable then v_selection.tax_cents else 0 end,v_catalog.default_unit_price_cents+case when v_catalog.is_taxable then v_selection.tax_cents else 0 end);
    insert into public.booking_themed_banner_reservations(business_id,booking_id,booking_item_id,banner_id,catalog_id,job_addon_id,rental_starts_at,rental_ends_at,name_snapshot,unit_price_cents)
      values(v_business,p_booking_id,v_booking_item.id,v_banner.id,v_catalog.id,v_addon_id,v_booking.rental_starts_at,v_booking.rental_ends_at,v_catalog.name,v_catalog.default_unit_price_cents);
    v_subtotal:=v_subtotal+v_catalog.default_unit_price_cents; v_tax:=v_tax+case when v_catalog.is_taxable then v_selection.tax_cents else 0 end; v_total:=v_total+v_catalog.default_unit_price_cents+case when v_catalog.is_taxable then v_selection.tax_cents else 0 end;
  end loop;
  update public.bookings set subtotal_cents=coalesce(subtotal_cents,0)+v_subtotal,tax_cents=coalesce(tax_cents,0)+v_tax,total_cents=coalesce(total_cents,0)+v_total,balance_due_cents=greatest(0,coalesce(total_cents,0)+v_total-coalesce(amount_paid_cents,0)),updated_at=now() where id=p_booking_id;
  if p_request_key is not null then insert into public.themed_banner_checkout_requests(business_id,request_key,booking_id) values(v_business,p_request_key,p_booking_id); end if;
  return jsonb_build_object('booking_id',p_booking_id,'subtotal_cents',v_subtotal,'tax_cents',v_tax,'total_cents',v_total,'replayed',false);
end $$;
revoke all on function public.add_public_themed_banners_to_booking(uuid,jsonb,uuid) from public;
grant execute on function public.add_public_themed_banners_to_booking(uuid,jsonb,uuid) to service_role;
commit;
