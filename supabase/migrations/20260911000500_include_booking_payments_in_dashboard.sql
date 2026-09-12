begin;

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
    select p.amount_cents,p.refunded_amount_cents,p.paid_at collected_at
    from public.payments p
    where p.business_id=p_business_id
      and p.status in('succeeded','partially_refunded','refunded')
      and (p.booking_id is null or p.invoice_id is not null)
    union all
    select b.amount_paid_cents::bigint,coalesce(b.refunded_cents,0)::bigint,b.paid_at
    from public.bookings b
    where b.business_id=p_business_id and b.paid_at is not null and coalesce(b.amount_paid_cents,0)>0
  ) collected);
end $$;

revoke all on function public.financial_dashboard_summary(uuid,date) from public;
grant execute on function public.financial_dashboard_summary(uuid,date) to authenticated;

notify pgrst,'reload schema';

commit;
