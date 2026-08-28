begin;

alter table public.business_google_ads_connections
 add column if not exists login_customer_id text,
 add column if not exists accessible_root_customer_ids text[] not null default '{}'::text[],
 add column if not exists accessible_root_customer_labels jsonb not null default '{}'::jsonb,
 add column if not exists selectable_customer_details jsonb not null default '[]'::jsonb;

comment on column public.business_google_ads_connections.login_customer_id is
 'Resolved Google Ads login-customer-id required to manage the selected advertiser account, typically the MCC/manager account when applicable.';
comment on column public.business_google_ads_connections.accessible_root_customer_ids is
 'Root customers returned directly by customers:listAccessibleCustomers for the authenticated Google Ads OAuth user.';
comment on column public.business_google_ads_connections.accessible_root_customer_labels is
 'Labels for root customers returned directly by customers:listAccessibleCustomers.';
comment on column public.business_google_ads_connections.selectable_customer_details is
 'Selectable advertiser accounts discovered from direct access and accessible manager hierarchies, including resolved login customer relationships.';

notify pgrst,'reload schema';
commit;
