begin;

create or replace function public.sales_performance_details(p_business_id uuid,p_from date,p_through date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_timezone text; v_result jsonb;
begin
 if auth.role()<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) and not public.is_servonas_platform_admin() then raise exception 'Sales performance denied' using errcode='42501'; end if;
 select coalesce(timezone,'UTC') into v_timezone from public.businesses where id=p_business_id;
 if p_from is null or p_through is null or p_from>p_through or p_from<date '1900-01-01' or p_through>(now() at time zone v_timezone)::date then raise exception 'Invalid sales date range' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'date',(r.collected_at at time zone v_timezone)::date,
  'cents',greatest(r.amount_cents-r.refunded_amount_cents,0),
  'customerKey',case when nullif(lower(btrim(c.email)),'') is not null then 'email:'||md5(nullif(lower(btrim(c.email)),'')) else 'customer:'||coalesce(c.id,r.customer_id,b.customer_id,i.customer_id)::text end,
  'weights',coalesce(w.weights,'[]'::jsonb),
  'itemWeights',coalesce(w.item_weights,'[]'::jsonb)
  )), '[]'::jsonb) into v_result
 from public.financial_collected_payment_details(p_business_id) r
 left join public.invoices i on i.id=r.invoice_id and i.business_id=p_business_id
 left join lateral (select booking.* from public.bookings booking where booking.business_id=p_business_id and (booking.id=r.booking_id or (i.job_id is not null and booking.job_id=i.job_id)) order by (booking.id=r.booking_id) desc nulls last,booking.id limit 1) b on true
 left join public.customers c on c.id=coalesce(r.customer_id,b.customer_id,i.customer_id) and c.business_id=p_business_id
 left join lateral (
  with parts as (
   select coalesce(nullif(rc.name,''),nullif(ii.category,''),'Uncategorized') category,
    coalesce(nullif(bi.item_name_snapshot,''),nullif(ii.name,''),'Uncategorized item') item_name,
    (bi.unit_price_cents::numeric*bi.quantity+coalesce(bi.operator_charge_cents,0))*greatest(coalesce(b.subtotal_cents,b.total_cents)-coalesce(b.discount_cents,0),0)::numeric/nullif(sum(bi.unit_price_cents::numeric*bi.quantity+coalesce(bi.operator_charge_cents,0)) over (),0) weight
   from public.booking_items bi
   left join public.inventory_items ii on ii.id=bi.inventory_item_id and ii.business_id=p_business_id
   left join public.rental_inventory_categories rc on rc.id=ii.category_id and rc.business_id=p_business_id
   where bi.booking_id=b.id
   union all select 'Delivery / Fees','Delivery / Fees',coalesce(b.delivery_fee_cents,0) where b.id is not null
   union all select 'Tax','Tax',coalesce(b.tax_cents,0) where b.id is not null
   union all select coalesce(nullif(pc.name,''),nullif(s.name,''),'Uncategorized'),coalesce(nullif(li.name_snapshot,''),'Uncategorized item'),greatest(li.line_total_cents-li.tax_amount_cents,0)
   from public.invoice_line_items li
   left join public.price_book_items pi on pi.id=li.price_book_item_id and pi.business_id=p_business_id
   left join public.price_book_categories pc on pc.id=pi.category_id and pc.business_id=p_business_id
   left join public.services s on s.id=coalesce(li.service_id,pi.service_id) and s.business_id=p_business_id
   where li.invoice_id=i.id and li.business_id=p_business_id and b.id is null
   union all select 'Delivery / Fees','Delivery / Fees',i.fee_total_cents where b.id is null and i.id is not null
   union all select 'Tax','Tax',i.tax_total_cents where b.id is null and i.id is not null
  ), known as (select category,item_name,weight from parts where weight>0), reconciled as (
   select category,item_name,weight from known
   union all select 'Uncategorized','Uncategorized charge',greatest(coalesce(b.total_cents,i.grand_total_cents,r.amount_cents)-(select coalesce(sum(weight),0) from known),0)
  )
  select
   (select coalesce(jsonb_agg(jsonb_build_object('category',category,'cents',cents) order by category),'[]'::jsonb) from (select category,sum(weight) cents from reconciled where weight>0 group by category) category_weights) as weights,
   (select coalesce(jsonb_agg(jsonb_build_object('category',category,'item',item_name,'cents',cents) order by category,item_name),'[]'::jsonb) from (select category,item_name,sum(weight) cents from reconciled where weight>0 group by category,item_name) item_weights) as item_weights
 ) w on true
 where r.collected_at>=(p_from::timestamp at time zone v_timezone) and r.collected_at<((p_through+1)::timestamp at time zone v_timezone);
 return v_result;
end;$$;

revoke all on function public.sales_performance_details(uuid,date,date) from public;
grant execute on function public.sales_performance_details(uuid,date,date) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
