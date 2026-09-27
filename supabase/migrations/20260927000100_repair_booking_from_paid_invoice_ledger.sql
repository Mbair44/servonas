-- Explicit, payment-intent-anchored repair for historical rows where an invoice
-- ledger payment posted successfully before the booking reconciliation trigger.
create or replace function public.repair_booking_from_paid_invoice_ledger(
  p_business_id uuid,p_booking_id uuid,p_payment_intent_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_booking public.bookings%rowtype; v_invoice public.invoices%rowtype; v_payment public.payments%rowtype; v_paid integer; v_balance integer;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'not_authorized'; end if;
  select * into v_booking from public.bookings where id=p_booking_id and business_id=p_business_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  select * into v_invoice from public.invoices where business_id=p_business_id and job_id=v_booking.job_id and not is_deleted and status='paid' for update;
  if not found then raise exception 'paid_invoice_not_found'; end if;
  select * into v_payment from public.payments where business_id=p_business_id and invoice_id=v_invoice.id and provider='stripe' and provider_payment_intent_id=p_payment_intent_id and status='succeeded' for update;
  if not found then raise exception 'successful_payment_intent_not_found'; end if;
  v_paid:=least(greatest(coalesce(v_invoice.amount_paid_cents,0),0),greatest(coalesce(v_booking.total_cents,0),0));
  v_balance:=greatest(coalesce(v_booking.total_cents,0)-v_paid,0);
  update public.bookings set amount_paid_cents=v_paid,balance_due_cents=v_balance,balance_charge_scheduled_for=case when v_balance=0 then null else balance_charge_scheduled_for end,status=case when v_balance=0 and status='confirmed' then 'paid' else status end where id=v_booking.id;
  update public.payment_attempts set status='succeeded',payment_id=v_payment.id,provider_payment_intent_id=v_payment.provider_payment_intent_id,completed_at=coalesce(v_payment.paid_at,completed_at,now()),failure_code=null,failure_reason=null where business_id=p_business_id and invoice_id=v_invoice.id and (payment_id=v_payment.id or provider_payment_intent_id=v_payment.provider_payment_intent_id);
  insert into public.billing_audit_events(business_id,customer_id,job_id,invoice_id,payment_id,event_type,metadata) values(p_business_id,v_booking.customer_id,v_booking.job_id,v_invoice.id,v_payment.id,'historical_paid_ledger_repaired',jsonb_build_object('source','admin_reconciliation_repair','payment_intent_id',p_payment_intent_id,'booking_balance_due_cents',v_balance));
  return jsonb_build_object('booking_id',v_booking.id,'invoice_id',v_invoice.id,'payment_id',v_payment.id,'amount_paid_cents',v_paid,'balance_due_cents',v_balance);
end $$;
grant execute on function public.repair_booking_from_paid_invoice_ledger(uuid,uuid,text) to authenticated;
