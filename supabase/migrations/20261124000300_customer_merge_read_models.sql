-- PR 3 canonical read models. They are security-invoker views for authorized
-- internal use only; public token routes continue to query their original rows.
begin;
create or replace view public.customer_canonical_financial_summary
with(security_invoker=true) as
select m.business_id,m.canonical_customer_id,
 coalesce(sum(i.balance_due_cents) filter(where not i.is_deleted),0)::bigint outstanding_balance_cents,
 coalesce(sum(i.amount_paid_cents-i.amount_refunded_cents) filter(where not i.is_deleted),0)::bigint invoice_net_paid_cents,
 coalesce(sum(p.amount_cents-p.refunded_amount_cents) filter(where p.status in('succeeded','partially_refunded','refunded')),0)::bigint payment_net_cents,
 count(distinct i.id) filter(where not i.is_deleted)::bigint invoice_count,
 count(distinct p.id) filter(where p.status in('succeeded','partially_refunded','refunded'))::bigint payment_count
from public.customer_canonical_memberships m
left join public.invoices i on i.business_id=m.business_id and i.customer_id=m.customer_id
left join public.payments p on p.business_id=m.business_id and p.customer_id=m.customer_id
group by m.business_id,m.canonical_customer_id;
create index if not exists customers_canonical_lookup_idx on public.customers(business_id,merged_into_customer_id,id);
notify pgrst,'reload schema';
commit;
