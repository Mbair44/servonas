begin;
-- Enrich the existing receipt source; the original summary and new metrics share it.
create function public.financial_collected_payment_details(p_business_id uuid)
returns table(amount_cents bigint,refunded_amount_cents bigint,collected_at timestamptz,customer_id uuid,booking_id uuid,invoice_id uuid)
language plpgsql stable security invoker set search_path=public as $$
begin
 if not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Financial dashboard denied' using errcode='42501'; end if;
 return query
 select p.amount_cents::bigint,least(p.amount_cents,p.refunded_amount_cents)::bigint,coalesce(p.paid_at,p.received_at),p.customer_id,p.booking_id,p.invoice_id
 from public.payments p where p.business_id=p_business_id and p.status in('succeeded','partially_refunded','refunded')
  and (p.booking_id is null or p.invoice_id is not null)
 union all
 select b.amount_paid_cents::bigint,least(b.amount_paid_cents,coalesce(b.refunded_cents,0))::bigint,b.paid_at,b.customer_id,b.id,null::uuid
 from public.bookings b where b.business_id=p_business_id and b.paid_at is not null and coalesce(b.amount_paid_cents,0)>0;
end;$$;
create or replace function public.financial_collected_payments(p_business_id uuid)
returns table(amount_cents bigint,refunded_amount_cents bigint,collected_at timestamptz)
language sql stable security invoker set search_path=public as $$
 select d.amount_cents,d.refunded_amount_cents,d.collected_at from public.financial_collected_payment_details(p_business_id) d;
$$;

create function public.sales_performance_details(p_business_id uuid,p_from date,p_through date)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare v_timezone text; v_result jsonb;
begin
 if not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Sales performance denied' using errcode='42501'; end if;
 select coalesce(timezone,'UTC') into v_timezone from public.businesses where id=p_business_id;
 if p_from is null or p_through is null or p_from>p_through or p_from<date '1900-01-01' or p_through>(now() at time zone v_timezone)::date then raise exception 'Invalid sales date range' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'date',(r.collected_at at time zone v_timezone)::date,
  'cents',greatest(r.amount_cents-r.refunded_amount_cents,0),
  -- Never infer a separate customer from each payment or booking. Email also
  -- unifies legacy duplicate customer records. Only an opaque key leaves SQL.
  'customerKey',case when coalesce(nullif(lower(btrim(c.email)),''),nullif(lower(btrim(b.email)),'')) is not null
   then 'email:'||md5(coalesce(nullif(lower(btrim(c.email)),''),nullif(lower(btrim(b.email)),'')))
   else 'customer:'||coalesce(c.id,r.customer_id,b.customer_id,i.customer_id)::text end,
  'weights',coalesce(w.weights,'[]'::jsonb)
  )), '[]'::jsonb) into v_result
 from public.financial_collected_payment_details(p_business_id) r
 left join public.invoices i on i.id=r.invoice_id and i.business_id=p_business_id
 -- Rental completion invoices can contain a single summary line; use the
 -- original rental lines for both deposit and subsequent invoice receipts.
 left join lateral (select booking.* from public.bookings booking where booking.business_id=p_business_id
  and (booking.id=r.booking_id or (i.job_id is not null and booking.job_id=i.job_id))
  order by (booking.id=r.booking_id) desc nulls last,booking.id limit 1) b on true
 left join public.customers c on c.id=coalesce(r.customer_id,b.customer_id,i.customer_id) and c.business_id=p_business_id
 left join lateral (
  with parts as (
   -- Booking discounts are saved at order level, so reduce item weights
   -- proportionally without consulting mutable promotion rules.
   select coalesce(nullif(rc.name,''),nullif(ii.category,''),'Uncategorized') category,
    (bi.unit_price_cents::numeric*bi.quantity+coalesce(bi.operator_charge_cents,0)) *
    greatest(coalesce(b.subtotal_cents,b.total_cents)-coalesce(b.discount_cents,0),0)::numeric /
    nullif(sum(bi.unit_price_cents::numeric*bi.quantity+coalesce(bi.operator_charge_cents,0)) over (),0) weight
   from public.booking_items bi
   left join public.inventory_items ii on ii.id=bi.inventory_item_id and ii.business_id=p_business_id
   left join public.rental_inventory_categories rc on rc.id=ii.category_id and rc.business_id=p_business_id
   where bi.booking_id=b.id
   union all select 'Delivery / Fees',coalesce(b.delivery_fee_cents,0) where b.id is not null
   union all select 'Tax',coalesce(b.tax_cents,0) where b.id is not null
   union all
   -- Invoice totals already include each line's share of document discounts.
   select coalesce(nullif(pc.name,''),nullif(s.name,''),'Uncategorized'),greatest(li.line_total_cents-li.tax_amount_cents,0)
   from public.invoice_line_items li
   left join public.price_book_items pi on pi.id=li.price_book_item_id and pi.business_id=p_business_id
   left join public.price_book_categories pc on pc.id=pi.category_id and pc.business_id=p_business_id
   left join public.services s on s.id=coalesce(li.service_id,pi.service_id) and s.business_id=p_business_id
   where li.invoice_id=i.id and li.business_id=p_business_id and b.id is null
   union all select 'Delivery / Fees',i.fee_total_cents where b.id is null and i.id is not null
   union all select 'Tax',i.tax_total_cents where b.id is null and i.id is not null
  ), known as (select category,weight from parts where weight>0), reconciled as (
   select category,weight from known
   union all select 'Uncategorized',greatest(coalesce(b.total_cents,i.grand_total_cents,r.amount_cents)-(select coalesce(sum(weight),0) from known),0)
  ) select jsonb_agg(jsonb_build_object('category',category,'cents',weight)) weights from reconciled where weight>0
 ) w on true
 where r.collected_at>=(p_from::timestamp at time zone v_timezone)
  and r.collected_at<((p_through+1)::timestamp at time zone v_timezone);
 return v_result;
end;$$;
revoke all on function public.financial_collected_payment_details(uuid),public.sales_performance_details(uuid,date,date) from public;
grant execute on function public.financial_collected_payment_details(uuid),public.sales_performance_details(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
