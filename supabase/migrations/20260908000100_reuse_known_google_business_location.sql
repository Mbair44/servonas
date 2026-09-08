begin;

update public.business_google_profile_connections
set status = 'connected',
    retry_after_at = null,
    last_discovery_error_code = null,
    last_discovery_error_message = null,
    discovery_retry_attempt_count = 0,
    updated_at = now()
where status = 'account_discovery_rate_limited'
  and google_account_id is not null
  and google_location_id is not null;

notify pgrst, 'reload schema';
commit;
