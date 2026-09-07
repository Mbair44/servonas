begin;

-- The original party-rental pilot accepted only three cities. Public checkout
-- now verifies real delivery addresses, so that pilot allowlist is obsolete.
alter table public.bookings
  drop constraint if exists bookings_delivery_city_check;

alter table public.bookings
  add constraint bookings_delivery_city_check
  check (
    delivery_city is null
    or length(btrim(delivery_city)) between 1 and 120
  ) not valid;

comment on constraint bookings_delivery_city_check on public.bookings is
  'Allows normalized delivery cities from verified public checkout addresses; replaces the legacy Gilbert/Chandler/Mesa pilot allowlist.';

commit;
