-- Epic 6 Checkpoint 6: invoice authoring, fees, and atomic offline payments.
begin;

alter table public.invoices
  add column if not exists request_key uuid,
  add column if not exists document_discount_type text not null default 'none',
  add column if not exists document_discount_value bigint not null default 0;

alter table public.invoices add constraint invoices_document_discount_type_check
  check (document_discount_type in ('none','fixed','percentage'));
alter table public.invoices add constraint invoices_document_discount_value_check
  check (
    document_discount_value >= 0 and
    (document_discount_type <> 'percentage' or document_discount_value <= 10000)
  );
create unique index invoices_business_request_key_unique
  on public.invoices(business_id,request_key) where request_key is not null;

create table public.invoice_fees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null,
  name_snapshot text not null check (length(trim(name_snapshot)) between 1 and 160),
  amount_cents bigint not null check (amount_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id,id),
  constraint invoice_fees_invoice_fk foreign key (business_id,invoice_id)
    references public.invoices(business_id,id) on delete cascade
);
create index invoice_fees_invoice_idx
  on public.invoice_fees(business_id,invoice_id,sort_order);

alter table public.invoice_fees enable row level security;
create policy "financial office reads invoice_fees" on public.invoice_fees
  for select to authenticated using (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "financial office creates invoice_fees" on public.invoice_fees
  for insert to authenticated with check (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "financial office updates invoice_fees" on public.invoice_fees
  for update to authenticated
  using (public.has_business_role(business_id,array['owner','admin','manager']))
  with check (public.has_business_role(business_id,array['owner','admin','manager']));
create policy "financial office deletes draft invoice fees" on public.invoice_fees
  for delete to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and exists (
      select 1 from public.invoices
      where invoices.id=invoice_fees.invoice_id
        and invoices.business_id=invoice_fees.business_id
        and invoices.status='draft'
    )
  );
create policy "financial office deletes draft invoice lines" on public.invoice_line_items
  for delete to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and exists (
      select 1 from public.invoices
      where invoices.id=invoice_line_items.invoice_id
        and invoices.business_id=invoice_line_items.business_id
        and invoices.status='draft'
    )
  );

create or replace function public.record_invoice_offline_payment(
  p_business_id uuid,
  p_invoice_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_received_at timestamptz,
  p_reference text,
  p_notes text,
  p_idempotency_key text
) returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_new_paid bigint;
  v_new_balance bigint;
begin
  if not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Offline payment permission denied' using errcode='42501';
  end if;
  if p_amount_cents <= 0 then
    raise exception 'Payment amount must be positive' using errcode='22023';
  end if;
  if p_method not in ('cash','check','bank_transfer','external_card_terminal','other') then
    raise exception 'Unsupported offline payment method' using errcode='22023';
  end if;

  select * into v_invoice from public.invoices
  where id=p_invoice_id and business_id=p_business_id and not is_deleted
  for update;
  if not found then raise exception 'Invoice not found' using errcode='P0002'; end if;
  if v_invoice.status in ('void','refunded') then
    raise exception 'Invoice cannot receive a payment' using errcode='23514';
  end if;
  if p_amount_cents > v_invoice.balance_due_cents then
    raise exception 'Payment exceeds invoice balance' using errcode='23514';
  end if;

  select id into v_payment_id from public.payments
  where business_id=p_business_id and idempotency_key=p_idempotency_key;
  if v_payment_id is not null then return v_payment_id; end if;

  insert into public.payments (
    business_id,customer_id,invoice_id,job_id,provider,amount_cents,status,
    idempotency_key,payment_method_type,currency,net_amount_cents,paid_at,
    received_at,offline_reference,offline_notes,recorded_by
  ) values (
    p_business_id,v_invoice.customer_id,v_invoice.id,v_invoice.job_id,'offline',
    p_amount_cents,'succeeded',p_idempotency_key,p_method,v_invoice.currency,
    p_amount_cents,p_received_at,p_received_at,nullif(trim(p_reference),''),
    nullif(trim(p_notes),''),auth.uid()
  ) returning id into v_payment_id;

  v_new_paid:=v_invoice.amount_paid_cents+p_amount_cents;
  v_new_balance:=greatest(v_invoice.grand_total_cents-v_new_paid+v_invoice.amount_refunded_cents,0);
  update public.invoices set
    amount_paid_cents=v_new_paid,
    balance_due_cents=v_new_balance,
    status=case when v_new_balance=0 then 'paid' else 'partially_paid' end,
    paid_at=case when v_new_balance=0 then p_received_at else null end,
    updated_by=auth.uid()
  where id=v_invoice.id and business_id=p_business_id;

  insert into public.invoice_events(
    business_id,invoice_id,event_type,actor_user_id,metadata
  ) values (
    p_business_id,v_invoice.id,
    case when v_new_balance=0 then 'paid' else 'offline_payment_recorded' end,
    auth.uid(),jsonb_build_object('payment_id',v_payment_id,'amount_cents',p_amount_cents,'method',p_method)
  );
  return v_payment_id;
end; $$;
revoke all on function public.record_invoice_offline_payment(uuid,uuid,bigint,text,timestamptz,text,text,text) from public;
grant execute on function public.record_invoice_offline_payment(uuid,uuid,bigint,text,timestamptz,text,text,text) to authenticated;

commit;
