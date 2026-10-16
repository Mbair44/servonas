-- Keep the checkout-only RPC inaccessible to browser roles in every environment.
begin;

revoke all on function public.create_public_booking_with_customer_addons(
  jsonb,date,date,text,text,text,text,time,time,text,text,text,text,jsonb,integer,uuid
) from public;
revoke all on function public.create_public_booking_with_customer_addons(
  jsonb,date,date,text,text,text,text,time,time,text,text,text,text,jsonb,integer,uuid
) from anon, authenticated;
grant execute on function public.create_public_booking_with_customer_addons(
  jsonb,date,date,text,text,text,text,time,time,text,text,text,text,jsonb,integer,uuid
) to service_role;

commit;
