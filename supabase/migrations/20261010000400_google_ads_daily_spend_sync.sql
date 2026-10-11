begin;

alter table public.business_ad_platform_daily_performance
 drop constraint if exists business_ad_platform_daily_performance_provider_check;
alter table public.business_ad_platform_daily_performance
 add constraint business_ad_platform_daily_performance_provider_check check (provider in ('meta','google_ads'));
alter table public.business_ad_platform_sync_events
 drop constraint if exists business_ad_platform_sync_events_provider_check;
alter table public.business_ad_platform_sync_events
 add constraint business_ad_platform_sync_events_provider_check check (provider in ('meta','google_ads'));

alter table public.business_google_ads_connections
 add column if not exists last_spend_sync_at timestamptz,
 add column if not exists last_spend_sync_attempt_at timestamptz,
 add column if not exists last_spend_sync_error text,
 add column if not exists last_spend_sync_rows integer not null default 0;

notify pgrst,'reload schema';
commit;
