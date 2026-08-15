begin;

alter table public.website_domain_orders
 add column if not exists purchase_notification_status text
  check(purchase_notification_status is null or purchase_notification_status in('pending','sending','sent','failed')),
 add column if not exists purchase_notification_sent_at timestamptz,
 add column if not exists purchase_notification_last_attempt_at timestamptz,
 add column if not exists purchase_notification_provider_id text,
 add column if not exists purchase_notification_attempts integer not null default 0,
 add column if not exists purchase_notification_error text;

comment on column public.website_domain_orders.purchase_notification_status is
 'Internal Servonas owner-email state for a Vercel-accepted domain purchase. It does not control or retry the purchase.';

notify pgrst,'reload schema';
commit;
