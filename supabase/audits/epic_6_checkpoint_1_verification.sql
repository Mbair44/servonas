-- Read-only verification after applying
-- 20260724000100_epic_6_checkpoint_1_financial_foundation.sql.

with required_tables(name) as (
  values
    ('price_book_categories'),('price_book_items'),('tax_rates'),
    ('financial_document_sequences'),('estimates'),('estimate_line_items'),
    ('estimate_versions'),('estimate_events'),('invoices'),
    ('invoice_line_items'),('invoice_events'),('payments'),
    ('payment_refunds'),('business_payment_accounts'),
    ('payment_webhook_events')
)
select name, to_regclass('public.' || name) is not null as exists
from required_tables
order by name;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'price_book_categories','price_book_items','tax_rates',
    'financial_document_sequences','estimates','estimate_line_items',
    'estimate_versions','estimate_events','invoices','invoice_line_items',
    'invoice_events','payments','payment_refunds',
    'business_payment_accounts','payment_webhook_events'
  )
order by c.relname;

select
  to_regprocedure('public.next_financial_document_number(uuid,text)') is not null
    as numbering_function_exists,
  to_regprocedure('public.protect_financial_document()') is not null
    as immutability_function_exists,
  to_regprocedure('public.enforce_refund_limit()') is not null
    as refund_limit_function_exists;

select
  count(*) filter (where public_token_hash is not null and octet_length(public_token_hash) <> 32)
    as invalid_estimate_token_hashes
from public.estimates;

select
  count(*) filter (where public_token_hash is not null and octet_length(public_token_hash) <> 32)
    as invalid_invoice_token_hashes
from public.invoices;

select count(*) as invalid_refund_totals
from (
  select p.id
  from public.payments p
  left join public.payment_refunds r
    on r.business_id=p.business_id
   and r.payment_id=p.id
   and r.status in ('pending','succeeded')
  group by p.id,p.amount_cents
  having coalesce(sum(r.amount_cents),0) > p.amount_cents
) invalid;
