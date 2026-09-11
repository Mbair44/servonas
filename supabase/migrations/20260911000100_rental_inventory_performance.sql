-- Derive rental-item payback from completed work and net customer collections.
create or replace function public.rental_inventory_performance(p_business_id uuid)
returns table(
  inventory_item_id uuid,
  lifetime_revenue_cents bigint,
  paid_rentals bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with completed_item_lines as (
    select
      b.id as booking_id,
      b.job_id,
      bi.inventory_item_id,
      sum(greatest(coalesce(bi.unit_price_cents, 0), 0) * greatest(coalesce(bi.quantity, 0), 0))::numeric as item_gross_cents,
      greatest(coalesce(b.discount_cents, 0), 0)::numeric as booking_discount_cents,
      greatest(coalesce(b.amount_paid_cents, 0) - coalesce(b.refunded_cents, 0), 0)::numeric as booking_collected_cents,
      greatest(coalesce(b.total_cents, 0), 0)::numeric as booking_total_cents
    from public.bookings b
    join public.jobs j
      on j.id = b.job_id
     and j.business_id = b.business_id
     and j.status = 'completed'
     and not j.is_deleted
    join public.booking_items bi on bi.booking_id = b.id
    where b.business_id = p_business_id
      and b.status not in ('pending_payment', 'expired', 'cancelled', 'refunded')
      and bi.status not in ('pending_payment', 'expired', 'refunded')
    group by b.id, b.job_id, bi.inventory_item_id
  ),
  booking_line_totals as (
    select booking_id, sum(item_gross_cents)::numeric as rental_gross_cents
    from completed_item_lines
    group by booking_id
  ),
  invoice_collections as (
    select
      job_id,
      greatest(sum(coalesce(amount_paid_cents, 0) - coalesce(amount_refunded_cents, 0)), 0)::numeric as collected_cents,
      greatest(sum(coalesce(grand_total_cents, 0)), 0)::numeric as total_cents
    from public.invoices
    where business_id = p_business_id
      and not is_deleted
    group by job_id
  ),
  recognized_lines as (
    select
      line.booking_id,
      line.inventory_item_id,
      round(
        case
          when totals.rental_gross_cents <= 0 then 0
          else
            line.item_gross_cents / totals.rental_gross_cents
            * greatest(totals.rental_gross_cents - least(line.booking_discount_cents, totals.rental_gross_cents), 0)
            * case
                when greatest(coalesce(invoice.collected_cents, line.booking_collected_cents), 0) <= 0 then 0
                when greatest(coalesce(invoice.total_cents, line.booking_total_cents), 0) <= 0 then 0
                else least(
                  greatest(coalesce(invoice.collected_cents, line.booking_collected_cents), 0)
                    / greatest(coalesce(invoice.total_cents, line.booking_total_cents), 1),
                  1
                )
              end
        end
      )::bigint as recognized_revenue_cents
    from completed_item_lines line
    join booking_line_totals totals using (booking_id)
    left join invoice_collections invoice on invoice.job_id = line.job_id
  )
  select
    inventory_item_id,
    coalesce(sum(recognized_revenue_cents), 0)::bigint as lifetime_revenue_cents,
    count(distinct booking_id) filter (where recognized_revenue_cents > 0)::bigint as paid_rentals
  from recognized_lines
  group by inventory_item_id;
$$;

revoke all on function public.rental_inventory_performance(uuid) from public;
grant execute on function public.rental_inventory_performance(uuid) to authenticated;

comment on function public.rental_inventory_performance(uuid) is
  'Completed rental-item revenue after proportional booking discounts, refunds, and unpaid balances; excludes tax, delivery, and operator charges.';
