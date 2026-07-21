-- Run this once in Supabase SQL Editor after the original schema.
-- It exposes only unavailable dates, not customer or booking details.

create or replace function public.get_unavailable_dates(
  p_inventory_item_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (rental_date date)
language sql
stable
security definer
set search_path = public
as $$
  select bi.rental_date
  from public.booking_items bi
  where bi.inventory_item_id = p_inventory_item_id
    and bi.rental_date between p_start_date and p_end_date
    and bi.status in ('pending_payment', 'paid', 'confirmed')

  union

  select bd.blocked_date
  from public.blocked_dates bd
  where bd.inventory_item_id = p_inventory_item_id
    and bd.blocked_date between p_start_date and p_end_date

  order by rental_date;
$$;

grant execute on function public.get_unavailable_dates(uuid, date, date) to anon, authenticated;
