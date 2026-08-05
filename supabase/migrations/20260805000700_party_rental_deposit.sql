alter table public.booking_settings
  add column if not exists rental_deposit_percent numeric(5,2) not null default 25;

alter table public.booking_settings
  drop constraint if exists booking_settings_rental_deposit_percent_check;

alter table public.booking_settings
  add constraint booking_settings_rental_deposit_percent_check
  check (rental_deposit_percent between 0 and 100);

comment on column public.booking_settings.rental_deposit_percent is
  'Percentage charged at party-rental booking when Stripe is ready. Zero defers the full balance to an invoice.';
