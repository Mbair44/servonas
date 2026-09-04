begin;
alter table public.business_google_profile_connections
 add column if not exists discovery_retry_source text,
 add column if not exists discovery_rate_limit_type text,
 add column if not exists discovery_diagnostics jsonb not null default '{}'::jsonb;
comment on column public.business_google_profile_connections.discovery_retry_source is 'How the next Google Business account-discovery retry time was chosen.';
comment on column public.business_google_profile_connections.discovery_diagnostics is 'Sanitized Google Business quota diagnostics. Never includes OAuth credentials.';
notify pgrst, 'reload schema';
commit;
