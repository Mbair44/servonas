create or replace function public.expire_due_assisted_payment_requests(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public as $$
declare row record; affected integer:=0;
begin
 for row in select id,business_id from public.bookings where status='pending_payment' and payment_request_expires_at is not null and payment_request_expires_at<=now() and coalesce(amount_paid_cents,0)<coalesce(deposit_cents,0) order by payment_request_expires_at limit greatest(1,least(p_limit,500)) for update skip locked loop
  update public.bookings set status='expired' where id=row.id and business_id=row.business_id and status='pending_payment' and payment_request_expires_at<=now() and coalesce(amount_paid_cents,0)<coalesce(deposit_cents,0);
  if found then
   update public.booking_items set status='expired' where booking_id=row.id and status='pending_payment';
   update public.discount_redemptions set status='voided' where business_id=row.business_id and booking_id=row.id and status='pending';
   affected:=affected+1;
  end if;
 end loop;
 return affected;
end;$$;
revoke all on function public.expire_due_assisted_payment_requests(integer) from public;
grant execute on function public.expire_due_assisted_payment_requests(integer) to service_role;
