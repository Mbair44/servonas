-- The report verifies tenant access before reading data, but its inventory and
-- category joins must not be filtered by the caller's independent table RLS.
-- Keep the existing function body and authorization guard; only run it as its
-- database owner after that guard succeeds.
begin;

alter function public.sales_performance_details(uuid,date,date) security definer;
alter function public.sales_performance_details(uuid,date,date) set search_path = public;

revoke all on function public.sales_performance_details(uuid,date,date) from public;
grant execute on function public.sales_performance_details(uuid,date,date) to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
