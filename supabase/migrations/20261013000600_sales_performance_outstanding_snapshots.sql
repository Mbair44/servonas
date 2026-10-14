begin;

-- Outstanding balances are mutable document state.  Until a balance snapshot
-- ledger exists, only a same-day balance is trustworthy; returning NULL for a
-- historical date prevents the dashboard from showing today's balance as if it
-- were a past-period value.
create or replace function public.sales_performance_outstanding_as_of(p_business_id uuid,p_as_of date)
returns bigint language plpgsql stable security invoker set search_path=public as $$
declare v_timezone text; v_today date;
begin
 if auth.role()<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) and not public.is_servonas_platform_admin() then
  raise exception 'Sales performance denied' using errcode='42501';
 end if;
 select coalesce(timezone,'UTC') into v_timezone from public.businesses where id=p_business_id;
 v_today=(now() at time zone v_timezone)::date;
 if p_as_of is null or p_as_of>v_today then raise exception 'Invalid outstanding balance date' using errcode='22023'; end if;
 if p_as_of<>v_today then return null; end if;
 return (public.sales_performance_summary(p_business_id,p_as_of,p_as_of)->>'outstandingCents')::bigint;
end;$$;

revoke all on function public.sales_performance_outstanding_as_of(uuid,date) from public;
grant execute on function public.sales_performance_outstanding_as_of(uuid,date) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
