begin;

alter table public.business_google_ads_connections
  add column if not exists google_authenticated_email text,
  add column if not exists google_authenticated_name text,
  add column if not exists login_customer_id text,
  add column if not exists accessible_root_customer_ids text[] not null default '{}'::text[],
  add column if not exists accessible_root_customer_labels jsonb not null default '{}'::jsonb,
  add column if not exists selectable_customer_details jsonb not null default '[]'::jsonb,
  add column if not exists account_discovery_last_successful_at timestamptz,
  add column if not exists account_discovery_last_attempted_at timestamptz,
  add column if not exists account_discovery_retry_after_at timestamptz,
  add column if not exists account_discovery_last_http_status integer,
  add column if not exists account_discovery_last_google_status text,
  add column if not exists account_discovery_last_message text,
  add column if not exists account_discovery_last_request_id text;

alter table public.business_google_ads_connections
  drop constraint if exists business_google_ads_connections_status_check;

alter table public.business_google_ads_connections
  add constraint business_google_ads_connections_status_check
  check(status in(
    'pending_selection',
    'connected',
    'oauth_connected',
    'account_discovery_pending',
    'account_discovery_rate_limited',
    'account_selected',
    'account_access_verified',
    'reauthorization_required',
    'disconnected'
  ));

comment on column public.business_google_ads_connections.google_authenticated_email is
 'Email address returned by Google for the OAuth identity that connected this tenant Google Ads integration.';
comment on column public.business_google_ads_connections.google_authenticated_name is
 'Display name returned by Google for the OAuth identity that connected this tenant Google Ads integration.';
comment on column public.business_google_ads_connections.login_customer_id is
 'Resolved Google Ads login-customer-id required to manage the selected advertiser account, typically the MCC/manager account when applicable.';
comment on column public.business_google_ads_connections.accessible_root_customer_ids is
 'Root customers returned directly by customers:listAccessibleCustomers for the authenticated Google Ads OAuth user.';
comment on column public.business_google_ads_connections.accessible_root_customer_labels is
 'Labels for root customers returned directly by customers:listAccessibleCustomers.';
comment on column public.business_google_ads_connections.selectable_customer_details is
 'Selectable advertiser accounts discovered from direct access and accessible manager hierarchies, including resolved login customer relationships.';
comment on column public.business_google_ads_connections.account_discovery_retry_after_at is
 'Next allowed account-discovery attempt when Google Ads returned quota or retry metadata.';

notify pgrst,'reload schema';
commit;
