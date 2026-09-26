-- Audited reconciliation resolutions. Financial history is preserved; this only
-- removes a future receivable when an authorized staff member cancels it.
alter table public.bookings add column if not exists is_test_booking boolean not null default false;
alter table public.bookings add column if not exists cancelled_at timestamptz;
alter table public.bookings add column if not exists cancelled_by uuid references auth.users(id);
alter table public.bookings add column if not exists cancellation_reason text;
alter table public.bookings add column if not exists cancellation_note text;

create table if not exists public.reconciliation_resolution_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  action text not null check (action in ('cancel_booking','cancel_test_booking','document_exception','void_invoice','record_manual_payment')),
  issue_type text,
  reason text not null,
  note text,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists reconciliation_resolution_audit_booking_idx on public.reconciliation_resolution_audit(booking_id,created_at desc);
alter table public.reconciliation_resolution_audit enable row level security;
create policy "staff view reconciliation resolution audit" on public.reconciliation_resolution_audit for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));

create or replace function public.resolve_reconciliation_booking_cancellation(
  p_business_id uuid,
  p_booking_id uuid,
  p_reason text,
  p_note text default null,
  p_is_test boolean default false,
  p_issue_type text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_booking public.bookings%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_action text:=case when p_is_test then 'cancel_test_booking' else 'cancel_booking' end;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'not_authorized'; end if;
  if p_reason not in ('customer_canceled','duplicate_booking','test_booking','entered_by_mistake','other') then raise exception 'invalid_cancellation_reason'; end if;
  select * into v_booking from public.bookings where id=p_booking_id and business_id=p_business_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_booking.status in ('cancelled','canceled','expired','refunded') then raise exception 'booking_is_not_cancellable'; end if;
  if v_booking.job_id is not null and exists(select 1 from public.jobs where id=v_booking.job_id and business_id=p_business_id and status='completed') then raise exception 'completed_job_cannot_be_cancelled'; end if;
  v_before:=jsonb_build_object('status',v_booking.status,'total_cents',v_booking.total_cents,'amount_paid_cents',v_booking.amount_paid_cents,'balance_due_cents',v_booking.balance_due_cents,'balance_charge_scheduled_for',v_booking.balance_charge_scheduled_for,'is_test_booking',v_booking.is_test_booking);
  -- Payments/refunds are deliberately untouched. A cancellation removes only an unpaid future balance.
  update public.bookings set status='cancelled', balance_due_cents=0, balance_charge_scheduled_for=null,
    payment_request_expires_at=null, is_test_booking=p_is_test or is_test_booking,
    cancelled_at=now(), cancelled_by=auth.uid(), cancellation_reason=p_reason, cancellation_note=nullif(trim(coalesce(p_note,'')), '')
  where id=p_booking_id and business_id=p_business_id;
  update public.booking_items set status='cancelled' where booking_id=p_booking_id and status in ('pending_payment','paid','confirmed');
  if v_booking.job_id is not null then
    update public.jobs set status='canceled',canceled_at=now(),cancellation_reason='Reconciliation: '||p_reason,updated_by=auth.uid()
    where id=v_booking.job_id and business_id=p_business_id and status not in ('completed','canceled');
  end if;
  select jsonb_build_object('status',status,'total_cents',total_cents,'amount_paid_cents',amount_paid_cents,'balance_due_cents',balance_due_cents,'balance_charge_scheduled_for',balance_charge_scheduled_for,'is_test_booking',is_test_booking) into v_after from public.bookings where id=p_booking_id;
  insert into public.reconciliation_resolution_audit(business_id,booking_id,action,issue_type,reason,note,before_snapshot,after_snapshot,actor_user_id)
  values(p_business_id,p_booking_id,v_action,p_issue_type,p_reason,nullif(trim(coalesce(p_note,'')),''),v_before,v_after,auth.uid());
  insert into public.booking_change_audit(booking_id,business_id,change_source,change_type,old_values,new_values,resulting_total_cents,resulting_balance_due_cents)
  values(p_booking_id,p_business_id,'staff',v_action,v_before,v_after,(v_after->>'total_cents')::integer,(v_after->>'balance_due_cents')::integer);
  return v_after;
end;
$$;
grant execute on function public.resolve_reconciliation_booking_cancellation(uuid,uuid,text,text,boolean,text) to authenticated;

create or replace function public.document_reconciliation_exception(
  p_business_id uuid,p_booking_id uuid,p_invoice_id uuid,p_payment_id uuid,
  p_issue_type text,p_reason text,p_note text,p_difference_cents integer
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'not_authorized'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'reason_and_note_required'; end if;
  if p_booking_id is not null and not exists(select 1 from public.bookings where id=p_booking_id and business_id=p_business_id) then raise exception 'booking_not_found'; end if;
  insert into public.reconciliation_resolution_audit(business_id,booking_id,invoice_id,payment_id,action,issue_type,reason,note,before_snapshot,after_snapshot,actor_user_id)
  values(p_business_id,p_booking_id,p_invoice_id,p_payment_id,'document_exception',p_issue_type,p_reason,p_note,jsonb_build_object('difference_cents',coalesce(p_difference_cents,0)),jsonb_build_object('difference_cents',coalesce(p_difference_cents,0)),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.document_reconciliation_exception(uuid,uuid,uuid,uuid,text,text,text,integer) to authenticated;
