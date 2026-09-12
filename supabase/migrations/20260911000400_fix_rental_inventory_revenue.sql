-- Completed rental revenue can exist on either the booking or its completion
-- invoice. Use the most complete source and retain a listing-level fallback for
-- historical bookings that predate physical-resource reservation snapshots.
create or replace function public.rental_inventory_performance(p_business_id uuid)
returns table(inventory_item_id uuid,lifetime_revenue_cents bigint,paid_rentals bigint)
language sql stable security invoker set search_path=public as $$
  with completed_lines as (
    select bi.id booking_item_id,bi.inventory_item_id listing_inventory_item_id,
      b.id booking_id,b.job_id,
      greatest(coalesce(bi.unit_price_cents,0),0)::numeric*greatest(coalesce(bi.quantity,0),0) item_gross_cents,
      greatest(coalesce(b.discount_cents,0),0)::numeric booking_discount_cents,
      greatest(coalesce(b.amount_paid_cents,0)-coalesce(b.refunded_cents,0),0)::numeric booking_collected_cents,
      greatest(coalesce(b.total_cents,0),0)::numeric booking_total_cents
    from public.bookings b
    join public.jobs j on j.id=b.job_id and j.business_id=b.business_id
      and j.status='completed' and not j.is_deleted
    join public.booking_items bi on bi.booking_id=b.id
    where b.business_id=p_business_id
      and b.status not in('pending_payment','expired','cancelled','refunded')
      and bi.status not in('pending_payment','expired','cancelled','refunded')
  ), booking_totals as (
    select booking_id,sum(item_gross_cents)::numeric rental_gross_cents
    from completed_lines group by booking_id
  ), invoice_collections as (
    select job_id,
      greatest(sum(coalesce(amount_paid_cents,0)-coalesce(amount_refunded_cents,0)),0)::numeric collected_cents,
      greatest(sum(coalesce(grand_total_cents,0)),0)::numeric total_cents
    from public.invoices
    where business_id=p_business_id and not is_deleted and status not in('void','draft')
    group by job_id
  ), recognized_lines as (
    select line.booking_item_id,line.listing_inventory_item_id,line.booking_id,
      round(case when totals.rental_gross_cents<=0 then 0 else
        line.item_gross_cents/totals.rental_gross_cents
        *greatest(totals.rental_gross_cents-least(line.booking_discount_cents,totals.rental_gross_cents),0)
        *case
          when greatest(coalesce(invoice.collected_cents,0),line.booking_collected_cents)<=0 then 0
          when greatest(coalesce(invoice.total_cents,0),line.booking_total_cents)<=0 then 0
          else least(
            greatest(coalesce(invoice.collected_cents,0),line.booking_collected_cents)
            /greatest(coalesce(invoice.total_cents,0),line.booking_total_cents),
            1
          )
        end end)::bigint recognized_revenue_cents
    from completed_lines line
    join booking_totals totals using(booking_id)
    left join invoice_collections invoice on invoice.job_id=line.job_id
  ), resource_allocations as (
    select recognized.booking_id,
      coalesce(reservation.resource_inventory_item_id,recognized.listing_inventory_item_id) resource_inventory_item_id,
      round(recognized.recognized_revenue_cents
        *coalesce(reservation.revenue_allocation_weight,1)
        /nullif(sum(coalesce(reservation.revenue_allocation_weight,1)) over(partition by recognized.booking_item_id),0)
      )::bigint resource_revenue_cents
    from recognized_lines recognized
    left join public.booking_inventory_reservations reservation
      on reservation.booking_item_id=recognized.booking_item_id
  )
  select resource_inventory_item_id,
    coalesce(sum(resource_revenue_cents),0)::bigint lifetime_revenue_cents,
    count(distinct booking_id) filter(where resource_revenue_cents>0)::bigint paid_rentals
  from resource_allocations
  group by resource_inventory_item_id;
$$;

revoke all on function public.rental_inventory_performance(uuid) from public;
grant execute on function public.rental_inventory_performance(uuid) to authenticated,service_role;

comment on function public.rental_inventory_performance(uuid) is
  'Completed rental-item revenue from the strongest net collection source, allocated across physical resources with a historical listing fallback.';
