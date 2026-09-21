-- Rental-item performance measures the item sale, not the timing or amount of
-- deposits/balance collections. Allocate order discounts across rental lines only.
create or replace function public.rental_inventory_performance(p_business_id uuid)
returns table(inventory_item_id uuid,lifetime_revenue_cents bigint,paid_rentals bigint)
language sql stable security invoker set search_path=public as $$
 with completed_lines as (
  select bi.id booking_item_id,bi.inventory_item_id listing_inventory_item_id,b.id booking_id,
   greatest(coalesce(bi.unit_price_cents,0),0)::numeric*greatest(coalesce(bi.quantity,0),0) item_gross_cents,
   greatest(coalesce(b.discount_cents,0),0)::numeric booking_discount_cents
  from public.bookings b join public.jobs j on j.id=b.job_id and j.business_id=b.business_id and j.status='completed' and not j.is_deleted
  join public.booking_items bi on bi.booking_id=b.id
  where b.business_id=p_business_id and b.status not in('pending_payment','expired','cancelled','refunded') and bi.status not in('pending_payment','expired','cancelled','refunded')
 ), booking_totals as (
  select booking_id,sum(item_gross_cents)::numeric rental_gross_cents from completed_lines group by booking_id
 ), final_sale_lines as (
  select line.booking_item_id,line.listing_inventory_item_id,line.booking_id,round(case when totals.rental_gross_cents<=0 then 0 else
   line.item_gross_cents/totals.rental_gross_cents*greatest(totals.rental_gross_cents-least(line.booking_discount_cents,totals.rental_gross_cents),0) end)::bigint final_sale_cents
  from completed_lines line join booking_totals totals using(booking_id)
 ), resource_allocations as (
  select sale.booking_id,coalesce(reservation.resource_inventory_item_id,sale.listing_inventory_item_id) resource_inventory_item_id,
   round(sale.final_sale_cents*coalesce(reservation.revenue_allocation_weight,1)/nullif(sum(coalesce(reservation.revenue_allocation_weight,1)) over(partition by sale.booking_item_id),0))::bigint resource_revenue_cents
  from final_sale_lines sale left join public.booking_inventory_reservations reservation on reservation.booking_item_id=sale.booking_item_id
 ) select resource_inventory_item_id,coalesce(sum(resource_revenue_cents),0)::bigint,count(distinct booking_id) filter(where resource_revenue_cents>0)::bigint from resource_allocations group by resource_inventory_item_id;
$$;
revoke all on function public.rental_inventory_performance(uuid) from public;
grant execute on function public.rental_inventory_performance(uuid) to authenticated,service_role;
