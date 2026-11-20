begin;

-- Correct the output-column ambiguity in the initial Smart Upsell sales
-- migration. This is deliberately forward-only so already-migrated production
-- databases receive the repaired RPC.
create or replace function public.sales_performance_booking_values(p_business_id uuid,p_from date,p_through date)
returns table(booking_date date,booking_value_cents bigint,booking_count bigint)
language plpgsql stable security invoker set search_path=public as $$
declare v_timezone text; v_today date;
begin
 if auth.role()<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) and not public.is_servonas_platform_admin() then raise exception 'Sales performance denied' using errcode='42501'; end if;
 select coalesce(timezone,'UTC') into v_timezone from public.businesses where id=p_business_id;
 v_today=(now() at time zone v_timezone)::date;
 if p_from is null or p_through is null or p_from>p_through or p_from<date '1900-01-01' or p_through>v_today then raise exception 'Invalid sales date range' using errcode='22023'; end if;

 return query
 with accepted_smart_upsells as (
   select amendment.booking_id,amendment.business_id,amendment.applied_at,
     greatest(0,coalesce((amendment.new_totals->>'total_cents')::bigint,0)-coalesce((amendment.old_totals->>'total_cents')::bigint,0)) as value_cents
   from public.booking_amendments amendment
   join public.smart_upsell_offers offer
     on offer.id::text=amendment.pricing_snapshot->>'smart_upsell_offer_id'
     and offer.business_id=amendment.business_id
   where amendment.business_id=p_business_id
     and amendment.status='applied' and amendment.applied_at is not null
     and offer.status='accepted'
 ),base_bookings as (
   select (booking.created_at at time zone v_timezone)::date as booking_date,
     sum(greatest(0,booking.total_cents-coalesce(upsells.value_cents,0)))::bigint as booking_value_cents,
     count(*)::bigint as booking_count
   from public.bookings booking
   left join lateral (
     select sum(value_cents)::bigint as value_cents
     from accepted_smart_upsells
     where booking_id=booking.id
   ) upsells on true
   where booking.business_id=p_business_id and booking.status in ('confirmed','paid','completed')
     and not exists(select 1 from public.jobs job where job.id=booking.job_id and job.business_id=p_business_id and (job.is_deleted or job.status='canceled'))
     and booking.created_at>=(p_from::timestamp at time zone v_timezone) and booking.created_at<((p_through+1)::timestamp at time zone v_timezone)
   group by 1
 ),smart_upsell_sales as (
   select (upsell.applied_at at time zone v_timezone)::date as booking_date,
     sum(upsell.value_cents)::bigint as booking_value_cents,
     0::bigint as booking_count
   from accepted_smart_upsells upsell
   join public.bookings booking on booking.id=upsell.booking_id and booking.business_id=upsell.business_id
   where booking.status in ('confirmed','paid','completed')
     and not exists(select 1 from public.jobs job where job.id=booking.job_id and job.business_id=p_business_id and (job.is_deleted or job.status='canceled'))
     and upsell.applied_at>=(p_from::timestamp at time zone v_timezone) and upsell.applied_at<((p_through+1)::timestamp at time zone v_timezone)
   group by 1
 )
 select base_booking.booking_date,base_booking.booking_value_cents,base_booking.booking_count from base_bookings base_booking
 union all
 select smart_upsell.booking_date,smart_upsell.booking_value_cents,smart_upsell.booking_count from smart_upsell_sales smart_upsell
 order by 1;
end;$$;

revoke all on function public.sales_performance_booking_values(uuid,date,date) from public;
grant execute on function public.sales_performance_booking_values(uuid,date,date) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
