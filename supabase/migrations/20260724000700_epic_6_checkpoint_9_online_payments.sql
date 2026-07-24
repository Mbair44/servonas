-- Epic 6 Checkpoint 9: hosted invoice payments and authoritative reconciliation.
begin;

alter table public.invoices
  add column if not exists allow_partial_payments boolean not null default false,
  add column if not exists minimum_partial_payment_cents bigint not null default 100;
alter table public.invoices drop constraint if exists invoices_minimum_partial_payment_check;
alter table public.invoices add constraint invoices_minimum_partial_payment_check
  check (minimum_partial_payment_cents > 0);

alter table public.payments
  add column if not exists payment_purpose text,
  add column if not exists provider_receipt_url text;
alter table public.payments drop constraint if exists payments_purpose_check;
alter table public.payments add constraint payments_purpose_check
  check (payment_purpose is null or payment_purpose in ('balance','deposit','partial'));
create unique index if not exists payments_provider_checkout_unique
  on public.payments(provider,provider_account_id,provider_checkout_session_id)
  where provider_checkout_session_id is not null;

create or replace function public.reconcile_invoice_online_payment(
  p_business_id uuid,
  p_payment_id uuid,
  p_status text,
  p_payment_intent_id text,
  p_charge_id text,
  p_payment_method_type text,
  p_receipt_url text,
  p_failure_code text,
  p_failure_message text,
  p_occurred_at timestamptz
) returns table(invoice_id uuid,invoice_status text,balance_due_cents bigint)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_new_paid bigint;
  v_new_balance bigint;
  v_new_status text;
begin
  if p_status not in ('requires_action','processing','succeeded','failed','canceled') then
    raise exception 'Unsupported online payment status' using errcode='22023';
  end if;
  select * into v_payment from public.payments
  where id=p_payment_id and business_id=p_business_id and provider='stripe'
  for update;
  if not found or v_payment.invoice_id is null then
    raise exception 'Invoice payment not found' using errcode='P0002';
  end if;

  if v_payment.status='succeeded' then
    select i.id,i.status,i.balance_due_cents into invoice_id,invoice_status,balance_due_cents
    from public.invoices i where i.id=v_payment.invoice_id and i.business_id=p_business_id;
    return next;
    return;
  end if;

  update public.payments set
    status=p_status,
    provider_payment_intent_id=coalesce(p_payment_intent_id,provider_payment_intent_id),
    provider_charge_id=coalesce(p_charge_id,provider_charge_id),
    payment_method_type=coalesce(p_payment_method_type,payment_method_type),
    provider_receipt_url=coalesce(p_receipt_url,provider_receipt_url),
    failure_code=case when p_status='failed' then p_failure_code else null end,
    failure_message=case when p_status='failed' then left(p_failure_message,1000) else null end,
    paid_at=case when p_status='succeeded' then p_occurred_at else paid_at end,
    failed_at=case when p_status='failed' then p_occurred_at else failed_at end,
    canceled_at=case when p_status='canceled' then p_occurred_at else canceled_at end,
    net_amount_cents=case when p_status='succeeded' then amount_cents-processing_fee_cents-platform_fee_cents else net_amount_cents end
  where id=v_payment.id and business_id=p_business_id;

  if p_status='succeeded' then
    select * into v_invoice from public.invoices
    where id=v_payment.invoice_id and business_id=p_business_id
    for update;
    if not found then raise exception 'Invoice not found' using errcode='P0002'; end if;
    v_new_paid:=v_invoice.amount_paid_cents+v_payment.amount_cents;
    v_new_balance:=greatest(v_invoice.grand_total_cents-v_new_paid+v_invoice.amount_refunded_cents,0);
    v_new_status:=case when v_new_balance=0 then 'paid' else 'partially_paid' end;
    update public.invoices set
      amount_paid_cents=v_new_paid,balance_due_cents=v_new_balance,status=v_new_status,
      paid_at=case when v_new_status='paid' then p_occurred_at else paid_at end
    where id=v_invoice.id and business_id=p_business_id;
    insert into public.invoice_events(business_id,invoice_id,event_type,metadata)
    values (
      p_business_id,v_invoice.id,
      case when v_new_status='paid' then 'paid' else 'partial_payment' end,
      jsonb_build_object('payment_id',v_payment.id,'amount_cents',v_payment.amount_cents,'provider','stripe')
    );
  elsif p_status='failed' then
    insert into public.invoice_events(business_id,invoice_id,event_type,metadata)
    values (p_business_id,v_payment.invoice_id,'payment_failed',jsonb_build_object('payment_id',v_payment.id,'failure_code',p_failure_code));
  end if;

  select i.id,i.status,i.balance_due_cents into invoice_id,invoice_status,balance_due_cents
  from public.invoices i where i.id=v_payment.invoice_id and i.business_id=p_business_id;
  return next;
end; $$;
revoke all on function public.reconcile_invoice_online_payment(uuid,uuid,text,text,text,text,text,text,text,timestamptz) from public;
grant execute on function public.reconcile_invoice_online_payment(uuid,uuid,text,text,text,text,text,text,text,timestamptz) to service_role;

commit;
