begin;
alter table public.business_google_profile_connections
 add column if not exists discovery_retry_attempt_count integer not null default 0 check(discovery_retry_attempt_count >= 0),
 add column if not exists discovery_operation_id text;
comment on column public.business_google_profile_connections.discovery_retry_attempt_count is 'Consecutive account-discovery rate-limit attempts used for bounded retry backoff.';
comment on column public.business_google_profile_connections.discovery_operation_id is 'Last Servonas operation ID for Google Business account discovery.';
notify pgrst, 'reload schema';
commit;
