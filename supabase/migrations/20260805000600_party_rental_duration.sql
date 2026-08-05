alter table public.booking_settings add column if not exists rental_duration_minutes integer not null default 240;
alter table public.booking_settings drop constraint if exists booking_settings_rental_duration_check;
alter table public.booking_settings add constraint booking_settings_rental_duration_check check(rental_duration_minutes between 30 and 720 and rental_duration_minutes % 30 = 0);
