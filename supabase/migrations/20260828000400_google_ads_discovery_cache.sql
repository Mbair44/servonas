begin;

alter table public.business_google_ads_connections
 add column if not exists account_discovery_last_successful_at timestamptz,
 add column if not exists account_discovery_last_attempted_at timestamptz,
 add column if not exists account_discovery_retry_after_at timestamptz,
 add column if not exists account_discovery_last_http_status integer,
 add column if not exists account_discovery_last_google_status text,
 add column if not exists account_discovery_last_message text,
 add column if not exists account_discovery_last_request_id text;

comment on column public.business_google_ads_connections.account_discovery_retry_after_at is
 'Next allowed account-discovery attempt when Google Ads returned quota or retry metadata.';

notify pgrst,'reload schema';
commit;
