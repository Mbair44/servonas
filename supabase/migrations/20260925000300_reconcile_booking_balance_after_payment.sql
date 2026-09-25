-- Keep rental bookings and completion schedules in sync with the payment ledger.
-- This covers offline payments, invoice Checkout payments, and technician payments
-- through one idempotent transition hook.
begin;

create or replace function public.reconcile_booking_after_payment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_booking public.bookings%rowtype;
  v_total bigint;
  v_paid bigint;
  v_balance bigint;
begin
  if new.status <> 'succeeded' or coalesce(old.status,'') = 'succeeded' then
    return new;
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.job_id = coalesce(new.job_id, (select i.job_id from public.invoices i where i.id=new.invoice_id))
    and b.business_id = new.business_id
  for update;
  if not found then return new; end if;

  v_total := greatest(coalesce(v_booking.total_cents,0),0);
  v_paid := greatest(coalesce(v_booking.amount_paid_cents,0),0) + greatest(coalesce(new.amount_cents,0),0);
  v_balance := greatest(0, least(v_total-v_paid, greatest(coalesce(v_booking.balance_due_cents,0),0)));
  update public.bookings
  set amount_paid_cents=least(v_total,v_paid),
      balance_due_cents=v_balance,
      balance_charge_scheduled_for=case when v_balance<=0 then null else balance_charge_scheduled_for end,
      status=case when v_balance<=0 and status in ('confirmed','completed') then 'paid' else status end,
      updated_at=now()
  where id=v_booking.id and business_id=new.business_id;
  return new;
end;
$$;

drop trigger if exists reconcile_booking_after_payment_trigger on public.payments;
create trigger reconcile_booking_after_payment_trigger
after insert or update of status on public.payments
for each row execute function public.reconcile_booking_after_payment();

commit;
