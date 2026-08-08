begin;

alter table public.customers
 add column if not exists marketing_email_status text not null default 'subscribed',
 add column if not exists marketing_email_opted_out_at timestamptz;

do $$ begin
 alter table public.customers add constraint customers_marketing_email_status_check
  check(marketing_email_status in('subscribed','unsubscribed'));
exception when duplicate_object then null; end $$;

alter table public.customer_campaign_recipients
 add column if not exists unsubscribed_at timestamptz;

create index if not exists customers_business_marketing_email_idx
 on public.customers(business_id,marketing_email_status)
 where is_deleted=false;

commit;
