begin;

-- Capacity and overlapping-time checks are enforced transactionally by
-- create_public_booking_quantities_timed. These legacy indexes incorrectly
-- prevent otherwise available inventory from being rented twice in one day.
drop index if exists public.one_active_reservation_per_item_date;
drop index if exists public.one_active_booking_per_item_date;

notify pgrst, 'reload schema';
commit;
