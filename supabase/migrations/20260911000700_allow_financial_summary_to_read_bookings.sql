begin;

drop policy if exists "managers can view rental bookings" on public.bookings;
create policy "managers can view rental bookings"
on public.bookings for select to authenticated
using (public.has_business_role(business_id,array['owner','admin','manager']));

commit;
