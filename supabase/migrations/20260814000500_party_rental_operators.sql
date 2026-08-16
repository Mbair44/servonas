-- Per-rental professional operator options. Existing rentals keep their current behavior.
alter table public.inventory_items
  add column if not exists operator_mode text not null default 'none',
  add column if not exists operator_hourly_rate_cents integer,
  add column if not exists operator_default_selected boolean not null default true;

alter table public.inventory_items drop constraint if exists inventory_items_operator_mode_check;
alter table public.inventory_items add constraint inventory_items_operator_mode_check
  check (operator_mode in ('none','optional','required'));
alter table public.inventory_items drop constraint if exists inventory_items_operator_rate_check;
alter table public.inventory_items add constraint inventory_items_operator_rate_check
  check (operator_hourly_rate_cents is null or operator_hourly_rate_cents between 0 and 100000000);

alter table public.bookings add column if not exists operator_total_cents integer not null default 0;
alter table public.booking_items
  add column if not exists operator_selected boolean not null default false,
  add column if not exists operator_mode_snapshot text not null default 'none',
  add column if not exists operator_hourly_rate_cents integer,
  add column if not exists operator_billable_hours integer,
  add column if not exists operator_charge_cents integer not null default 0;

alter table public.booking_items drop constraint if exists booking_items_operator_mode_snapshot_check;
alter table public.booking_items add constraint booking_items_operator_mode_snapshot_check
  check (operator_mode_snapshot in ('none','optional','required'));
alter table public.booking_items drop constraint if exists booking_items_operator_hours_check;
alter table public.booking_items add constraint booking_items_operator_hours_check
  check (operator_billable_hours is null or operator_billable_hours >= 0);
