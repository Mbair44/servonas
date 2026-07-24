-- Epic 6 Checkpoints 11-13: technician billing, notification audit, dashboard aging.
begin;

alter table public.price_book_items add column if not exists technician_can_add boolean not null default true;

create table if not exists public.financial_notification_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null,
  payment_id uuid,
  refund_id uuid,
  event_type text not null check (event_type in (
    'invoice_sent','invoice_viewed','payment_link_sent','payment_succeeded','payment_failed',
    'partial_payment','invoice_paid','invoice_overdue','refund_issued','receipt_sent'
  )),
  channel text not null default 'email' check (channel in ('email')),
  recipient_email text,
  status text not null check (status in ('stubbed','queued','sent','failed','skipped')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint financial_notification_invoice_fk foreign key (business_id,invoice_id) references public.invoices(business_id,id),
  constraint financial_notification_payment_fk foreign key (business_id,payment_id) references public.payments(business_id,id),
  constraint financial_notification_refund_fk foreign key (business_id,refund_id) references public.payment_refunds(business_id,id)
);
create unique index if not exists financial_notification_dedupe
  on public.financial_notification_events(invoice_id,event_type,coalesce(payment_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(refund_id,'00000000-0000-0000-0000-000000000000'::uuid));
alter table public.financial_notification_events enable row level security;
create policy "financial office reads notification events" on public.financial_notification_events
  for select to authenticated using (public.has_business_role(business_id,array['owner','admin','manager']));

create or replace function public.technician_generate_job_invoice(p_job_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_job public.jobs%rowtype; v_id uuid; v_number text; v_value bigint; v_prefix text;
begin
  select * into v_job from public.jobs where id=p_job_id and not is_deleted for update;
  if not found or not public.is_assigned_technician(v_job.business_id,p_job_id) then raise exception 'Assigned job not found' using errcode='42501'; end if;
  select id into v_id from public.invoices where business_id=v_job.business_id and job_id=v_job.id and not is_deleted;
  if v_id is not null then return v_id; end if;
  insert into public.financial_document_sequences(business_id,document_type,prefix,next_value)
  values(v_job.business_id,'invoice','INV-',2)
  on conflict(business_id,document_type) do update set next_value=financial_document_sequences.next_value+1,updated_at=now()
  returning next_value-1,prefix into v_value,v_prefix;
  v_number:=v_prefix||lpad(v_value::text,6,'0');
  insert into public.invoices(business_id,invoice_number,customer_id,service_location_id,job_id,status,title,currency,issue_date,source_key,created_by,updated_by)
  values(v_job.business_id,v_number,v_job.customer_id,v_job.service_location_id,v_job.id,'draft',v_job.title,'USD',current_date,v_job.id,auth.uid(),auth.uid())
  returning id into v_id;
  insert into public.invoice_events(business_id,invoice_id,event_type,actor_user_id,metadata)
  values(v_job.business_id,v_id,'created',auth.uid(),jsonb_build_object('source','technician'));
  return v_id;
end $$;
revoke all on function public.technician_generate_job_invoice(uuid) from public;
grant execute on function public.technician_generate_job_invoice(uuid) to authenticated;

create or replace function public.technician_add_invoice_item(p_job_id uuid,p_item_id uuid,p_quantity numeric) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_job public.jobs%rowtype; v_invoice public.invoices%rowtype; v_item public.price_book_items%rowtype; v_line uuid; v_sub bigint;
begin
  if p_quantity<=0 or p_quantity>10000 then raise exception 'Invalid quantity' using errcode='22023'; end if;
  select * into v_job from public.jobs where id=p_job_id and not is_deleted;
  if not found or not public.is_assigned_technician(v_job.business_id,p_job_id) then raise exception 'Assigned job not found' using errcode='42501'; end if;
  select * into v_invoice from public.invoices where business_id=v_job.business_id and job_id=p_job_id and status='draft' and not is_deleted for update;
  if not found then raise exception 'Generate a draft invoice first' using errcode='23514'; end if;
  select * into v_item from public.price_book_items where id=p_item_id and business_id=v_job.business_id and is_active and not is_deleted and technician_can_add;
  if not found then raise exception 'Price item is unavailable' using errcode='42501'; end if;
  v_sub:=round(v_item.default_unit_price_cents*p_quantity);
  insert into public.invoice_line_items(business_id,invoice_id,price_book_item_id,service_id,name_snapshot,description_snapshot,quantity,unit_type_snapshot,unit_price_cents,internal_unit_cost_cents,is_taxable,tax_rate_basis_points,line_subtotal_cents,tax_amount_cents,line_total_cents,sort_order)
  values(v_job.business_id,v_invoice.id,v_item.id,v_item.service_id,v_item.name,v_item.description,p_quantity,v_item.unit_type,v_item.default_unit_price_cents,v_item.internal_cost_cents,v_item.is_taxable,0,v_sub,0,v_sub,(select count(*) from public.invoice_line_items where invoice_id=v_invoice.id))
  returning id into v_line;
  update public.invoices set subtotal_cents=subtotal_cents+v_sub,grand_total_cents=grand_total_cents+v_sub,balance_due_cents=balance_due_cents+v_sub,updated_by=auth.uid() where id=v_invoice.id;
  insert into public.invoice_events(business_id,invoice_id,event_type,actor_user_id,metadata) values(v_job.business_id,v_invoice.id,'updated',auth.uid(),jsonb_build_object('source','technician','line_id',v_line));
  return v_line;
end $$;
revoke all on function public.technician_add_invoice_item(uuid,uuid,numeric) from public;
grant execute on function public.technician_add_invoice_item(uuid,uuid,numeric) to authenticated;

create or replace function public.technician_present_job_invoice(p_job_id uuid,p_token_hash bytea,p_expires_at timestamptz) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_invoice uuid;
begin
  select business_id into v_business from public.jobs where id=p_job_id and not is_deleted;
  if v_business is null or not public.is_assigned_technician(v_business,p_job_id) then raise exception 'Assigned job not found' using errcode='42501'; end if;
  update public.invoices set status='sent',sent_at=coalesce(sent_at,now()),public_token_hash=p_token_hash,public_token_expires_at=p_expires_at,public_token_revoked_at=null,updated_by=auth.uid()
  where business_id=v_business and job_id=p_job_id and status in('draft','sent','viewed','partially_paid') and grand_total_cents>0 and not is_deleted returning id into v_invoice;
  if v_invoice is null then raise exception 'A priced draft invoice is required' using errcode='23514'; end if;
  insert into public.invoice_events(business_id,invoice_id,event_type,actor_user_id,metadata) values(v_business,v_invoice,'sent',auth.uid(),jsonb_build_object('source','technician'));
  return v_invoice;
end $$;
revoke all on function public.technician_present_job_invoice(uuid,bytea,timestamptz) from public;
grant execute on function public.technician_present_job_invoice(uuid,bytea,timestamptz) to authenticated;

create or replace function public.technician_record_job_payment(p_job_id uuid,p_amount bigint,p_method text,p_received_at timestamptz,p_reference text,p_key text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_invoice public.invoices%rowtype; v_payment uuid; v_balance bigint;
begin
  if p_method not in('cash','check') or p_amount<=0 then raise exception 'Only valid cash or check payments are permitted' using errcode='22023'; end if;
  select business_id into v_business from public.jobs where id=p_job_id and not is_deleted;
  if v_business is null or not public.is_assigned_technician(v_business,p_job_id) then raise exception 'Assigned job not found' using errcode='42501'; end if;
  select id into v_payment from public.payments where business_id=v_business and idempotency_key=p_key;
  if v_payment is not null then return v_payment; end if;
  select * into v_invoice from public.invoices where business_id=v_business and job_id=p_job_id and status in('sent','viewed','partially_paid','overdue') and not is_deleted for update;
  if not found or p_amount>v_invoice.balance_due_cents then raise exception 'Payment exceeds available invoice balance' using errcode='23514'; end if;
  insert into public.payments(business_id,customer_id,invoice_id,job_id,provider,amount_cents,status,idempotency_key,payment_method_type,currency,net_amount_cents,paid_at,received_at,offline_reference,recorded_by)
  values(v_business,v_invoice.customer_id,v_invoice.id,p_job_id,'offline',p_amount,'succeeded',p_key,p_method,v_invoice.currency,p_amount,p_received_at,p_received_at,nullif(trim(p_reference),''),auth.uid()) returning id into v_payment;
  v_balance:=v_invoice.balance_due_cents-p_amount;
  update public.invoices set amount_paid_cents=amount_paid_cents+p_amount,balance_due_cents=v_balance,status=case when v_balance=0 then 'paid' else 'partially_paid' end,paid_at=case when v_balance=0 then p_received_at else null end,updated_by=auth.uid() where id=v_invoice.id;
  insert into public.invoice_events(business_id,invoice_id,event_type,actor_user_id,metadata) values(v_business,v_invoice.id,case when v_balance=0 then 'paid' else 'offline_payment_recorded' end,auth.uid(),jsonb_build_object('source','technician','payment_id',v_payment,'method',p_method,'amount_cents',p_amount));
  return v_payment;
end $$;
revoke all on function public.technician_record_job_payment(uuid,bigint,text,timestamptz,text,text) from public;
grant execute on function public.technician_record_job_payment(uuid,bigint,text,timestamptz,text,text) to authenticated;

create policy "assigned technicians read approved price book" on public.price_book_items for select to authenticated
  using (technician_can_add and is_active and not is_deleted and exists(select 1 from public.technician_profiles t where t.business_id=price_book_items.business_id and t.member_user_id=auth.uid() and t.is_active and t.is_technician));
create policy "assigned technicians read job invoices" on public.invoices for select to authenticated
  using (job_id is not null and public.is_assigned_technician(business_id,job_id));
create policy "assigned technicians read job invoice lines" on public.invoice_line_items for select to authenticated
  using (exists(select 1 from public.invoices i where i.id=invoice_line_items.invoice_id and i.business_id=invoice_line_items.business_id and i.job_id is not null and public.is_assigned_technician(i.business_id,i.job_id)));
create policy "assigned technicians read job payments" on public.payments for select to authenticated
  using (job_id is not null and public.is_assigned_technician(business_id,job_id));

create or replace function public.financial_dashboard_summary(p_business_id uuid,p_as_of date default current_date)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
  if not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Financial dashboard denied' using errcode='42501'; end if;
  select jsonb_build_object(
    'draft_estimates',count(*) filter(where kind='estimate' and status='draft'),
    'sent_estimates',count(*) filter(where kind='estimate' and status in('sent','viewed')),
    'accepted_estimates',count(*) filter(where kind='estimate' and status in('accepted','converted')),
    'decided_estimates',count(*) filter(where kind='estimate' and status in('accepted','converted','declined')),
    'outstanding_estimate_cents',coalesce(sum(total) filter(where kind='estimate' and status in('sent','viewed')),0),
    'draft_invoices',count(*) filter(where kind='invoice' and status='draft'),
    'outstanding_invoice_cents',coalesce(sum(balance) filter(where kind='invoice' and status in('sent','viewed','partially_paid','overdue')),0),
    'overdue_cents',coalesce(sum(balance) filter(where kind='invoice' and due_date<p_as_of and status in('sent','viewed','partially_paid','overdue')),0),
    'aging_current_cents',coalesce(sum(balance) filter(where kind='invoice' and (due_date is null or due_date>=p_as_of) and status in('sent','viewed','partially_paid','overdue')),0),
    'aging_1_30_cents',coalesce(sum(balance) filter(where kind='invoice' and p_as_of-due_date between 1 and 30 and status in('sent','viewed','partially_paid','overdue')),0),
    'aging_31_60_cents',coalesce(sum(balance) filter(where kind='invoice' and p_as_of-due_date between 31 and 60 and status in('sent','viewed','partially_paid','overdue')),0),
    'aging_61_90_cents',coalesce(sum(balance) filter(where kind='invoice' and p_as_of-due_date between 61 and 90 and status in('sent','viewed','partially_paid','overdue')),0),
    'aging_90_plus_cents',coalesce(sum(balance) filter(where kind='invoice' and p_as_of-due_date>90 and status in('sent','viewed','partially_paid','overdue')),0)
  ) into result from (
    select 'estimate' kind,status,grand_total_cents total,0::bigint balance,null::date due_date from public.estimates where business_id=p_business_id and not is_deleted
    union all select 'invoice',status,grand_total_cents,balance_due_cents,due_date from public.invoices where business_id=p_business_id and not is_deleted
  ) d;
  return result || (select jsonb_build_object(
    'payments_today_cents',coalesce(sum(amount_cents-refunded_amount_cents) filter(where paid_at::date=p_as_of),0),
    'payments_month_cents',coalesce(sum(amount_cents-refunded_amount_cents) filter(where date_trunc('month',paid_at)=date_trunc('month',p_as_of::timestamptz)),0),
    'refunds_month_cents',coalesce(sum(refunded_amount_cents) filter(where date_trunc('month',paid_at)=date_trunc('month',p_as_of::timestamptz)),0),
    'average_ticket_cents',coalesce(round(avg(amount_cents) filter(where status in('succeeded','partially_refunded','refunded'))),0)
  ) from public.payments where business_id=p_business_id);
end $$;
revoke all on function public.financial_dashboard_summary(uuid,date) from public;
grant execute on function public.financial_dashboard_summary(uuid,date) to authenticated;

commit;
