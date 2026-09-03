begin;

alter table public.business_google_profile_connections
  drop constraint if exists business_google_profile_connections_status_check;

alter table public.business_google_profile_connections
  add constraint business_google_profile_connections_status_check
  check(status in('connected','reauthorization_required','oauth_connected','account_discovery_pending','account_discovery_rate_limited'));

alter table public.business_google_profile_connections
  alter column google_account_id drop not null,
  alter column google_location_id drop not null,
  add column if not exists last_discovery_attempt_at timestamptz,
  add column if not exists last_discovery_success_at timestamptz,
  add column if not exists retry_after_at timestamptz,
  add column if not exists last_discovery_error_code text,
  add column if not exists last_discovery_error_message text;

comment on column public.business_google_profile_connections.last_discovery_attempt_at is
  'Last attempted Google Business account/location discovery after OAuth completion.';
comment on column public.business_google_profile_connections.last_discovery_success_at is
  'Last successful Google Business account/location discovery timestamp.';
comment on column public.business_google_profile_connections.retry_after_at is
  'Retry-After guidance from Google when account discovery is rate limited.';

notify pgrst, 'reload schema';
commit;
