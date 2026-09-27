-- The payments ledger is canonical for a captured Stripe charge. Keep the
-- operational attempt record in lockstep when a webhook or later repair marks
-- that ledger payment successful.
create or replace function public.sync_scheduled_payment_attempt_after_ledger_success()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_attempt public.payment_attempts%rowtype;
begin
  if new.provider<>'stripe' or new.status<>'succeeded' or coalesce(old.status,'')='succeeded' then return new; end if;
  select * into v_attempt from public.payment_attempts
  where business_id=new.business_id and (payment_id=new.id or (provider_payment_intent_id is not null and provider_payment_intent_id=new.provider_payment_intent_id))
  order by attempted_at desc limit 1 for update;
  if found then
    update public.payment_attempts set payment_id=new.id,provider_payment_intent_id=coalesce(new.provider_payment_intent_id,provider_payment_intent_id),status='succeeded',completed_at=coalesce(new.paid_at,now()),failure_code=null,failure_reason=null
    where id=v_attempt.id and business_id=new.business_id;
    insert into public.billing_audit_events(business_id,invoice_id,payment_id,event_type,metadata)
    values(new.business_id,new.invoice_id,new.id,'automatic_payment_succeeded',jsonb_build_object('source','payment_ledger_success','payment_attempt_id',v_attempt.id,'payment_intent_id',new.provider_payment_intent_id));
  end if;
  return new;
end;
$$;
drop trigger if exists sync_scheduled_payment_attempt_after_ledger_success on public.payments;
create trigger sync_scheduled_payment_attempt_after_ledger_success
after insert or update of status,provider_payment_intent_id on public.payments
for each row execute function public.sync_scheduled_payment_attempt_after_ledger_success();

-- Repair only attempts already tied to a captured Stripe ledger payment. This
-- is idempotent and intentionally does not infer a charge from an amount/name.
update public.payment_attempts attempt set
  status='succeeded',
  provider_payment_intent_id=coalesce(payment.provider_payment_intent_id,attempt.provider_payment_intent_id),
  completed_at=coalesce(payment.paid_at,attempt.completed_at,now()),
  failure_code=null,
  failure_reason=null
from public.payments payment
where payment.id=attempt.payment_id
  and payment.business_id=attempt.business_id
  and payment.provider='stripe'
  and payment.status='succeeded'
  and attempt.status<>'succeeded';
