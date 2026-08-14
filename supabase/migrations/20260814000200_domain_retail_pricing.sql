begin;

alter table public.website_domain_orders
 add column if not exists customer_purchase_price numeric(12,2),
 add column if not exists customer_renewal_price numeric(12,2),
 add column if not exists retail_markup_bps integer not null default 1500
  check(retail_markup_bps between 0 and 10000);

update public.website_domain_orders
set customer_purchase_price=round(purchase_price*1.15,2),
    customer_renewal_price=round(renewal_price*1.15,2),
    retail_markup_bps=1500
where (purchase_price is not null and customer_purchase_price is null)
   or (renewal_price is not null and customer_renewal_price is null);

comment on column public.website_domain_orders.purchase_price is
 'Provider purchase quote used as the Vercel expectedPrice. This is internal provider cost.';
comment on column public.website_domain_orders.renewal_price is
 'Provider renewal quote retained as internal provider cost.';
comment on column public.website_domain_orders.customer_purchase_price is
 'Customer-facing first-year retail price captured with the quote.';
comment on column public.website_domain_orders.customer_renewal_price is
 'Customer-facing annual renewal retail price captured with the quote.';
comment on column public.website_domain_orders.retail_markup_bps is
 'Retail markup snapshot in basis points used for this quote.';

commit;
