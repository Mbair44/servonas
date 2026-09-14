begin;
-- Shared read-only aggregation; no new financial records or ledger are introduced.
create function public.financial_collected_payments(p_business_id uuid)
returns table(amount_cents bigint,refunded_amount_cents bigint,collected_at timestamptz)
language plpgsql stable security invoker set search_path=public as $$
begin
 if not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Financial dashboard denied' using errcode='42501'; end if;
 return query
 select p.amount_cents::bigint,least(p.amount_cents,p.refunded_amount_cents)::bigint,coalesce(p.paid_at,p.received_at)
 from public.payments p where p.business_id=p_business_id and p.status in('succeeded','partially_refunded','refunded')
  and (p.booking_id is null or p.invoice_id is not null)
 union all
 select b.amount_paid_cents::bigint,least(b.amount_paid_cents,coalesce(b.refunded_cents,0))::bigint,b.paid_at
 from public.bookings b where b.business_id=p_business_id and b.paid_at is not null and coalesce(b.amount_paid_cents,0)>0;
end;$$;

create or replace function public.financial_dashboard_summary(p_business_id uuid,p_as_of date default current_date)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; v_timezone text;
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
  select timezone into v_timezone from public.businesses where id=p_business_id;
  return result || (select jsonb_build_object(
    'payments_today_cents',coalesce(sum(amount_cents-refunded_amount_cents) filter(where (collected_at at time zone coalesce(v_timezone,'UTC'))::date=p_as_of),0),
    'payments_month_cents',coalesce(sum(amount_cents-refunded_amount_cents) filter(where date_trunc('month',collected_at at time zone coalesce(v_timezone,'UTC'))=date_trunc('month',p_as_of::timestamp)),0),
    'refunds_month_cents',coalesce(sum(refunded_amount_cents) filter(where date_trunc('month',collected_at at time zone coalesce(v_timezone,'UTC'))=date_trunc('month',p_as_of::timestamp)),0),
    'average_ticket_cents',coalesce(round(avg(amount_cents)),0)
  ) from (
    select amount_cents,refunded_amount_cents,collected_at from public.financial_collected_payments(p_business_id)
  ) collected);
end $$;


create function public.sales_performance_summary(p_business_id uuid,p_from date,p_through date)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare v_timezone text; v_today date; v_result jsonb; v_outstanding bigint;
begin
 if not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Sales performance denied' using errcode='42501'; end if;
 select coalesce(timezone,'UTC') into v_timezone from public.businesses where id=p_business_id;
 v_today=(now() at time zone v_timezone)::date;
 if p_from is null or p_through is null or p_from>p_through or p_from<date '1900-01-01' or p_through>v_today then raise exception 'Invalid sales date range' using errcode='22023'; end if;
 with receipts as materialized (
  select (collected_at at time zone v_timezone)::date receipt_date,greatest(amount_cents-refunded_amount_cents,0) cents
  from public.financial_collected_payments(p_business_id)
  where collected_at is not null and collected_at<((p_through+1)::timestamp at time zone v_timezone)
 ), daily as (
  select receipt_date,sum(cents)::bigint cents from receipts where receipt_date>=p_from group by receipt_date
 ) select jsonb_build_object('firstCollectedDate',(select min(receipt_date) from receipts),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('date',receipt_date,'cents',cents) order by receipt_date) from daily),'[]'::jsonb)) into v_result;

 -- An invoice becomes the source of truth once a booking is invoiced. A paid,
 -- refunded or written-off invoice must not revive an old booking balance.
 with active_bookings as (
  select b.* from public.bookings b where b.business_id=p_business_id and b.status in('confirmed','paid','completed')
   and not exists(select 1 from public.jobs j where j.id=b.job_id and j.business_id=p_business_id and (j.is_deleted or j.status='canceled'))
 ), invoice_balances as (
  select greatest(least(i.balance_due_cents,greatest(i.grand_total_cents-i.amount_paid_cents,0)),0)::bigint cents
  from public.invoices i where i.business_id=p_business_id and not i.is_deleted
   and (i.status in('sent','viewed','partially_paid','overdue') or (i.status='draft'
    and exists(select 1 from active_bookings b where b.job_id=i.job_id)
    and not exists(select 1 from public.invoices other where other.business_id=p_business_id and other.job_id=i.job_id and not other.is_deleted and other.status not in('draft','void'))))
   and not exists(select 1 from public.jobs j where j.business_id=p_business_id and j.id=i.job_id and (j.is_deleted or j.status='canceled'))
   and not exists(select 1 from public.bookings b where b.business_id=p_business_id and b.job_id=i.job_id and b.status in('cancelled','canceled','expired','refunded'))
 ), booking_balances as (
  select greatest(least(coalesce(b.balance_due_cents,0),greatest(b.total_cents-coalesce(b.amount_paid_cents,0),0)),0)::bigint cents
  from active_bookings b where not exists(select 1 from public.invoices i where i.business_id=p_business_id and i.job_id=b.job_id and not i.is_deleted and i.status<>'void')
 ) select coalesce(sum(cents),0) into v_outstanding from (select cents from invoice_balances union all select cents from booking_balances) amounts;
 return v_result||jsonb_build_object('outstandingCents',v_outstanding);
end;$$;
revoke all on function public.financial_collected_payments(uuid),public.sales_performance_summary(uuid,date,date) from public;
grant execute on function public.financial_collected_payments(uuid),public.sales_performance_summary(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
