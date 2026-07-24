-- Epic 6 Checkpoint 10: auditable payment voids and provider/offline refunds.
begin;

alter table public.payment_refunds
  add column if not exists refund_method text not null default 'provider',
  add column if not exists offline_reference text;
alter table public.payment_refunds drop constraint if exists payment_refunds_method_check;
alter table public.payment_refunds add constraint payment_refunds_method_check
  check (refund_method in ('provider','offline'));
alter table public.payment_refunds drop constraint if exists payment_refunds_status_check;
alter table public.payment_refunds add constraint payment_refunds_status_check
  check (status in ('pending','requires_action','succeeded','failed','canceled'));

alter table public.invoice_events drop constraint if exists invoice_events_event_type_check;
alter table public.invoice_events add constraint invoice_events_event_type_check
  check (event_type in (
    'created','updated','sent','viewed','payment_initiated','payment_succeeded',
    'payment_failed','payment_voided','partial_payment','paid','overdue','voided',
    'refund_initiated','refund_succeeded','refund_failed','offline_payment_recorded',
    'receipt_sent','public_link_accessed'
  ));

create or replace function public.create_invoice_refund_request(
  p_business_id uuid,
  p_payment_id uuid,
  p_amount_cents bigint,
  p_refund_method text,
  p_reason text,
  p_internal_notes text,
  p_offline_reference text,
  p_idempotency_key text
) returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_payment public.payments%rowtype;
  v_refund_id uuid;
begin
  if not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Refund permission denied' using errcode='42501';
  end if;
  if p_amount_cents <= 0 then raise exception 'Refund amount must be positive' using errcode='22023'; end if;
  if p_refund_method not in ('provider','offline') then raise exception 'Unsupported refund method' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Refund reason is required' using errcode='22023'; end if;

  select id into v_refund_id from public.payment_refunds
  where business_id=p_business_id and idempotency_key=p_idempotency_key;
  if v_refund_id is not null then return v_refund_id; end if;

  select * into v_payment from public.payments
  where id=p_payment_id and business_id=p_business_id
  for update;
  if not found or v_payment.invoice_id is null then raise exception 'Invoice payment not found' using errcode='P0002'; end if;
  if v_payment.status not in ('succeeded','partially_refunded') then
    raise exception 'Payment cannot be refunded' using errcode='23514';
  end if;
  if p_amount_cents > v_payment.amount_cents-v_payment.refunded_amount_cents then
    raise exception 'Refund exceeds refundable payment amount' using errcode='23514';
  end if;
  if p_refund_method='provider' and (v_payment.provider<>'stripe' or v_payment.provider_payment_intent_id is null) then
    raise exception 'Provider refund is unavailable for this payment' using errcode='23514';
  end if;

  insert into public.payment_refunds(
    business_id,payment_id,idempotency_key,amount_cents,status,refund_method,
    reason,internal_notes,offline_reference,requested_by
  ) values (
    p_business_id,v_payment.id,p_idempotency_key,p_amount_cents,'pending',p_refund_method,
    trim(p_reason),nullif(trim(p_internal_notes),''),nullif(trim(p_offline_reference),''),auth.uid()
  ) returning id into v_refund_id;

  insert into public.invoice_events(business_id,invoice_id,event_type,actor_user_id,metadata)
  values (
    p_business_id,v_payment.invoice_id,'refund_initiated',auth.uid(),
    jsonb_build_object('payment_id',v_payment.id,'refund_id',v_refund_id,'amount_cents',p_amount_cents,'method',p_refund_method)
  );
  return v_refund_id;
end; $$;
revoke all on function public.create_invoice_refund_request(uuid,uuid,bigint,text,text,text,text,text) from public;
grant execute on function public.create_invoice_refund_request(uuid,uuid,bigint,text,text,text,text,text) to authenticated;

create or replace function public.reconcile_invoice_refund(
  p_business_id uuid,
  p_refund_id uuid,
  p_status text,
  p_provider_refund_id text,
  p_failure_message text,
  p_completed_at timestamptz
) returns table(invoice_id uuid,invoice_status text,balance_due_cents bigint)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_refund public.payment_refunds%rowtype;
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_new_refunded bigint;
  v_invoice_refunded bigint;
  v_balance bigint;
  v_status text;
begin
  if auth.role()<>'service_role' and not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Refund reconciliation permission denied' using errcode='42501';
  end if;
  if p_status not in ('pending','requires_action','succeeded','failed','canceled') then
    raise exception 'Unsupported refund status' using errcode='22023';
  end if;
  select * into v_refund from public.payment_refunds
  where id=p_refund_id and business_id=p_business_id for update;
  if not found then raise exception 'Refund not found' using errcode='P0002'; end if;

  if v_refund.status='succeeded' then
    select i.id,i.status,i.balance_due_cents into invoice_id,invoice_status,balance_due_cents
    from public.payments p join public.invoices i on i.id=p.invoice_id and i.business_id=p.business_id
    where p.id=v_refund.payment_id and p.business_id=p_business_id;
    return next; return;
  end if;

  update public.payment_refunds set
    status=p_status,
    provider_refund_id=coalesce(p_provider_refund_id,provider_refund_id),
    completed_at=case when p_status='succeeded' then coalesce(p_completed_at,now()) else completed_at end,
    failed_at=case when p_status='failed' then now() else failed_at end,
    failure_message=case when p_status='failed' then left(p_failure_message,1000) else null end
  where id=v_refund.id and business_id=p_business_id;

  select * into v_payment from public.payments
  where id=v_refund.payment_id and business_id=p_business_id for update;
  if not found or v_payment.invoice_id is null then raise exception 'Refund payment not found' using errcode='P0002'; end if;

  if p_status='succeeded' then
    select * into v_invoice from public.invoices
    where id=v_payment.invoice_id and business_id=p_business_id for update;
    if not found then raise exception 'Refund invoice not found' using errcode='P0002'; end if;
    v_new_refunded:=v_payment.refunded_amount_cents+v_refund.amount_cents;
    update public.payments set
      refunded_amount_cents=v_new_refunded,
      status=case when v_new_refunded>=amount_cents then 'refunded' else 'partially_refunded' end
    where id=v_payment.id and business_id=p_business_id;
    v_invoice_refunded:=v_invoice.amount_refunded_cents+v_refund.amount_cents;
    v_balance:=least(v_invoice.grand_total_cents,greatest(v_invoice.grand_total_cents-v_invoice.amount_paid_cents+v_invoice_refunded,0));
    v_status:=case
      when v_invoice.amount_paid_cents>0 and v_invoice_refunded>=v_invoice.amount_paid_cents then 'refunded'
      when v_balance>0 then 'partially_paid'
      else 'paid'
    end;
    update public.invoices set
      amount_refunded_cents=v_invoice_refunded,balance_due_cents=v_balance,status=v_status,
      paid_at=case when v_balance=0 then paid_at else null end,updated_by=coalesce(auth.uid(),updated_by)
    where id=v_invoice.id and business_id=p_business_id;
    insert into public.invoice_events(business_id,invoice_id,event_type,actor_user_id,metadata)
    values (
      p_business_id,v_invoice.id,'refund_succeeded',auth.uid(),
      jsonb_build_object('payment_id',v_payment.id,'refund_id',v_refund.id,'amount_cents',v_refund.amount_cents,'method',v_refund.refund_method)
    );
  elsif p_status='failed' then
    insert into public.invoice_events(business_id,invoice_id,event_type,actor_user_id,metadata)
    values (
      p_business_id,v_payment.invoice_id,'refund_failed',auth.uid(),
      jsonb_build_object('payment_id',v_payment.id,'refund_id',v_refund.id)
    );
  end if;

  select i.id,i.status,i.balance_due_cents into invoice_id,invoice_status,balance_due_cents
  from public.invoices i where i.id=v_payment.invoice_id and i.business_id=p_business_id;
  return next;
end; $$;
revoke all on function public.reconcile_invoice_refund(uuid,uuid,text,text,text,timestamptz) from public;
grant execute on function public.reconcile_invoice_refund(uuid,uuid,text,text,text,timestamptz) to authenticated,service_role;

create or replace function public.void_invoice_offline_payment(
  p_business_id uuid,
  p_payment_id uuid,
  p_reason text
) returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_paid bigint;
  v_balance bigint;
begin
  if not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Payment void permission denied' using errcode='42501';
  end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Void reason is required' using errcode='22023'; end if;
  select * into v_payment from public.payments
  where id=p_payment_id and business_id=p_business_id and provider='offline' for update;
  if not found or v_payment.invoice_id is null then raise exception 'Offline payment not found' using errcode='P0002'; end if;
  if v_payment.status<>'succeeded' or v_payment.refunded_amount_cents<>0 then
    raise exception 'Only an unrefunded offline payment can be voided' using errcode='23514';
  end if;
  select * into v_invoice from public.invoices
  where id=v_payment.invoice_id and business_id=p_business_id for update;
  if not found then raise exception 'Invoice not found' using errcode='P0002'; end if;

  update public.payments set status='void',voided_by=auth.uid(),voided_at=now(),void_reason=trim(p_reason)
  where id=v_payment.id and business_id=p_business_id;
  v_paid:=greatest(v_invoice.amount_paid_cents-v_payment.amount_cents,0);
  v_balance:=least(v_invoice.grand_total_cents,greatest(v_invoice.grand_total_cents-v_paid+v_invoice.amount_refunded_cents,0));
  update public.invoices set
    amount_paid_cents=v_paid,balance_due_cents=v_balance,
    status=case when v_paid>0 and v_invoice.amount_refunded_cents>=v_paid then 'refunded'
      when v_paid-v_invoice.amount_refunded_cents>0 then 'partially_paid'
      when viewed_at is not null then 'viewed' when sent_at is not null then 'sent' else 'draft' end,
    paid_at=null,updated_by=auth.uid()
  where id=v_invoice.id and business_id=p_business_id;
  insert into public.invoice_events(business_id,invoice_id,event_type,actor_user_id,metadata)
  values (
    p_business_id,v_invoice.id,'payment_voided',auth.uid(),
    jsonb_build_object('payment_id',v_payment.id,'amount_cents',v_payment.amount_cents,'reason',trim(p_reason))
  );
  return v_payment.id;
end; $$;
revoke all on function public.void_invoice_offline_payment(uuid,uuid,text) from public;
grant execute on function public.void_invoice_offline_payment(uuid,uuid,text) to authenticated;

commit;
