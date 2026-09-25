begin;

-- Booking value is a sale-value metric: one stored final total per qualifying
-- booking, dated by booking creation in the tenant's time zone. It deliberately
-- does not read payments or invoices.
create function public.sales_performance_booking_values(p_business_id uuid,p_from date,p_through date)
returns table(booking_date date,booking_value_cents bigint,booking_count bigint)
language plpgsql stable security invoker set search_path=public as $$
declare v_timezone text; v_today date;
begin
 if auth.role()<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) and not public.is_servonas_platform_admin() then raise exception 'Sales performance denied' using errcode='42501'; end if;
 select coalesce(timezone,'UTC') into v_timezone from public.businesses where id=p_business_id;
 v_today=(now() at time zone v_timezone)::date;
 if p_from is null or p_through is null or p_from>p_through or p_from<date '1900-01-01' or p_through>v_today then raise exception 'Invalid sales date range' using errcode='22023'; end if;
 return query
 select (b.created_at at time zone v_timezone)::date as booking_date,
  sum(b.total_cents)::bigint as booking_value_cents,
  count(*)::bigint as booking_count
 from public.bookings b
 where b.business_id=p_business_id
  and b.status in ('confirmed','paid','completed')
  and b.created_at>=(p_from::timestamp at time zone v_timezone)
  and b.created_at<((p_through+1)::timestamp at time zone v_timezone)
 group by 1
 order by 1;
end;$$;

revoke all on function public.sales_performance_booking_values(uuid,date,date) from public;
grant execute on function public.sales_performance_booking_values(uuid,date,date) to authenticated,service_role;
notify pgrst,'reload schema';

commit;
