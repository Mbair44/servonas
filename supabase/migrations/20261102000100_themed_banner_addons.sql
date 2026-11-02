-- Reusable, quantity-limited themed-banner extensions for the existing
-- customer add-on catalog. This migration deliberately creates no tenant data.
begin;

create table public.rental_themed_banners(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 catalog_id uuid not null unique references public.job_addon_catalog(id) on delete cascade,
 physical_quantity integer not null default 1 check(physical_quantity>0),
 acquisition_cost_cents integer not null default 0 check(acquisition_cost_cents>=0),
 available_from date, available_until date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
 check(available_until is null or available_from is null or available_until>=available_from),
 unique(business_id,id)
);

create table public.rental_themed_banner_compatible_inventory(
 banner_id uuid not null references public.rental_themed_banners(id) on delete cascade,
 business_id uuid not null references public.businesses(id) on delete cascade,
 inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(banner_id,inventory_item_id)
);

create table public.booking_themed_banner_reservations(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 booking_id uuid not null references public.bookings(id) on delete cascade,
 booking_item_id uuid not null references public.booking_items(id) on delete cascade,
 banner_id uuid not null references public.rental_themed_banners(id) on delete restrict,
 catalog_id uuid not null references public.job_addon_catalog(id) on delete restrict,
 job_addon_id uuid references public.job_addons(id) on delete set null,
 quantity integer not null default 1 check(quantity>0),
 rental_starts_at timestamptz not null, rental_ends_at timestamptz not null,
 name_snapshot text not null, unit_price_cents integer not null check(unit_price_cents>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(rental_ends_at>rental_starts_at), unique(booking_item_id,banner_id)
);
create index booking_themed_banner_capacity_idx on public.booking_themed_banner_reservations(banner_id,rental_starts_at,rental_ends_at);
create index booking_themed_banner_booking_idx on public.booking_themed_banner_reservations(business_id,booking_id);

create or replace function public.enforce_themed_banner_tenant()
returns trigger language plpgsql set search_path=public as $$
declare v_business uuid;
begin
 select business_id into v_business from public.rental_themed_banners where id=new.banner_id;
 if v_business is null or v_business<>new.business_id then raise exception 'Banner tenant does not match.' using errcode='23503'; end if;
 if not exists(select 1 from public.job_addon_catalog where id=new.catalog_id and business_id=new.business_id) then raise exception 'Banner catalog tenant does not match.' using errcode='23503'; end if;
 if not exists(select 1 from public.bookings where id=new.booking_id and business_id=new.business_id) then raise exception 'Banner booking tenant does not match.' using errcode='23503'; end if;
 if not exists(select 1 from public.booking_items where id=new.booking_item_id and booking_id=new.booking_id) then raise exception 'Banner must be linked to a booking rental.' using errcode='23503'; end if;
 if not exists(select 1 from public.rental_themed_banner_compatible_inventory c join public.booking_items bi on bi.inventory_item_id=c.inventory_item_id where c.banner_id=new.banner_id and c.business_id=new.business_id and bi.id=new.booking_item_id) then raise exception 'Banner is incompatible with this rental.' using errcode='23503'; end if;
 return new;
end $$;
create trigger booking_themed_banner_tenant before insert or update on public.booking_themed_banner_reservations for each row execute function public.enforce_themed_banner_tenant();

alter table public.rental_themed_banners enable row level security;
alter table public.rental_themed_banner_compatible_inventory enable row level security;
alter table public.booking_themed_banner_reservations enable row level security;
create policy "members read themed banners" on public.rental_themed_banners for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage themed banners" on public.rental_themed_banners for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members read themed banner compatibility" on public.rental_themed_banner_compatible_inventory for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage themed banner compatibility" on public.rental_themed_banner_compatible_inventory for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members read themed banner reservations" on public.booking_themed_banner_reservations for select to authenticated using(public.is_business_member(business_id));

-- Capacity is checked under a transaction-scoped advisory lock per physical
-- banner. Pending-payment, paid, and confirmed bookings all consume stock;
-- cancellations/expirations release it automatically because they are omitted.
create or replace function public.themed_banner_available_quantity(p_banner_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns integer language sql stable set search_path=public as $$
 select greatest(0,b.physical_quantity-coalesce((select sum(r.quantity)::integer from public.booking_themed_banner_reservations r join public.bookings booking on booking.id=r.booking_id where r.banner_id=b.id and booking.status in ('pending_payment','paid','confirmed') and r.rental_starts_at<p_ends_at+make_interval(mins=>coalesce((select buffer_minutes from public.booking_settings where business_id=b.business_id),60)) and r.rental_ends_at+make_interval(mins=>coalesce((select buffer_minutes from public.booking_settings where business_id=b.business_id),60))>p_starts_at),0)) from public.rental_themed_banners b where b.id=p_banner_id;
$$;

create or replace function public.reserve_themed_banner(p_booking_id uuid,p_banner_id uuid,p_booking_item_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_booking public.bookings%rowtype; v_banner public.rental_themed_banners%rowtype; v_catalog public.job_addon_catalog%rowtype; v_reservation_id uuid;
begin
 select * into v_booking from public.bookings where id=p_booking_id for update;
 if not found or v_booking.status not in ('pending_payment','paid','confirmed') then raise exception 'Booking is no longer eligible for a banner reservation.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_banner_id::text,0));
 select * into v_banner from public.rental_themed_banners where id=p_banner_id and business_id=v_booking.business_id for update;
 if not found or (v_banner.available_from is not null and v_booking.rental_starts_at::date<v_banner.available_from) or (v_banner.available_until is not null and v_booking.rental_starts_at::date>v_banner.available_until) then raise exception 'This banner is unavailable for the selected date.' using errcode='22023'; end if;
 select * into v_catalog from public.job_addon_catalog where id=v_banner.catalog_id and business_id=v_booking.business_id and is_active and customer_visible and visibility='public_future';
 if not found then raise exception 'This banner is not available for online booking.' using errcode='22023'; end if;
 if public.themed_banner_available_quantity(p_banner_id,v_booking.rental_starts_at,v_booking.rental_ends_at)<1 then raise exception 'This banner is already reserved for the selected date.' using errcode='23505'; end if;
 insert into public.booking_themed_banner_reservations(business_id,booking_id,booking_item_id,banner_id,catalog_id,rental_starts_at,rental_ends_at,name_snapshot,unit_price_cents)
 values(v_booking.business_id,v_booking.id,p_booking_item_id,v_banner.id,v_banner.catalog_id,v_booking.rental_starts_at,v_booking.rental_ends_at,v_catalog.name,v_catalog.default_unit_price_cents)
 returning id into v_reservation_id;
 return v_reservation_id;
end $$;
revoke all on function public.reserve_themed_banner(uuid,uuid,uuid) from public;
grant execute on function public.reserve_themed_banner(uuid,uuid,uuid) to service_role;

commit;
