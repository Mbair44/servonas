begin;

create table if not exists public.delivery_fee_settings(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 enabled boolean not null default false,
 origin_address_line1 text,
 origin_address_line2 text,
 origin_city text,
 origin_state text,
 origin_postal_code text,
 origin_country_code text not null default 'US',
 origin_place_id text,
 origin_latitude double precision,
 origin_longitude double precision,
 pricing_method text not null default 'distance_tiers' check(pricing_method in('distance_tiers','per_mile')),
 free_radius_miles numeric(8,2) not null default 0 check(free_radius_miles>=0),
 per_mile_rate_cents integer not null default 0 check(per_mile_rate_cents>=0),
 minimum_fee_cents integer not null default 0 check(minimum_fee_cents>=0),
 maximum_distance_miles numeric(8,2) check(maximum_distance_miles is null or maximum_distance_miles>=0),
 outside_area_action text not null default 'request_quote' check(outside_area_action in('block','request_quote','long_distance_fee')),
 long_distance_fee_cents integer not null default 0 check(long_distance_fee_cents>=0),
 delivery_taxable boolean not null default false,
 tiers jsonb not null default '[]'::jsonb check(jsonb_typeof(tiers)='array'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.delivery_route_cache(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 origin_fingerprint text not null,
 destination_fingerprint text not null,
 provider text not null,
 distance_meters integer not null check(distance_meters>=0),
 duration_seconds integer check(duration_seconds is null or duration_seconds>=0),
 provider_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(provider_metadata)='object'),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique(business_id,origin_fingerprint,destination_fingerprint)
);

alter table public.bookings
 add column if not exists delivery_fee_original_cents integer not null default 0,
 add column if not exists delivery_fee_cents integer not null default 0,
 add column if not exists delivery_distance_miles numeric(8,2),
 add column if not exists delivery_pricing_method text,
 add column if not exists delivery_rule_snapshot jsonb,
 add column if not exists delivery_origin_snapshot jsonb,
 add column if not exists delivery_destination_snapshot jsonb,
 add column if not exists delivery_inside_service_area boolean,
 add column if not exists delivery_calculated_at timestamptz,
 add column if not exists delivery_provider text,
 add column if not exists delivery_provider_metadata jsonb,
 add column if not exists delivery_fee_overridden_at timestamptz,
 add column if not exists delivery_fee_overridden_by uuid references auth.users(id) on delete set null,
 add column if not exists delivery_fee_override_reason text;

alter table public.bookings drop constraint if exists bookings_delivery_fee_original_nonnegative;
alter table public.bookings add constraint bookings_delivery_fee_original_nonnegative check(delivery_fee_original_cents>=0);
alter table public.bookings drop constraint if exists bookings_delivery_fee_nonnegative;
alter table public.bookings add constraint bookings_delivery_fee_nonnegative check(delivery_fee_cents>=0);

alter table public.booking_funnel_events drop constraint if exists booking_funnel_events_event_name_check;
alter table public.booking_funnel_events add constraint booking_funnel_events_event_name_check check(event_name in(
 'landing_page_view','inventory_item_view','inventory_item_clicked','check_availability_clicked','availability_date_selected','booking_started','customer_info_entered','checkout_started','booking_completed','availability_check_started','event_date_selected','available_inventory_viewed','rental_viewed','rental_availability_checked','rental_available','rental_unavailable','reserve_clicked','item_added_to_cart','event_date_changed','unavailable_alternative_clicked','landing_view','service_view','inventory_view','booking_cta_click','availability_check','date_selected','lead_submitted','payment_completed','session_heartbeat','link_click','button_click','phone_click','sms_click','email_click','form_start','form_submit','product_service_selection','delivery_address_entered','delivery_distance_calculated','delivery_fee_calculated','outside_service_area','delivery_quote_requested','delivery_fee_overridden'
));

create index if not exists delivery_route_cache_expiry_idx on public.delivery_route_cache(business_id,expires_at);
alter table public.delivery_fee_settings enable row level security;
alter table public.delivery_route_cache enable row level security;
create policy "members read delivery settings" on public.delivery_fee_settings for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage delivery settings" on public.delivery_fee_settings for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
-- Route cache is server-only because it represents authoritative pricing inputs.
revoke all on public.delivery_route_cache from anon,authenticated;

notify pgrst,'reload schema';
commit;
