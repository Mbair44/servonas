begin;

alter table public.business_google_ads_connections
 add column if not exists google_authenticated_email text,
 add column if not exists google_authenticated_name text;

comment on column public.business_google_ads_connections.google_authenticated_email is
 'Email address returned by Google for the OAuth identity that connected this tenant Google Ads integration.';
comment on column public.business_google_ads_connections.google_authenticated_name is
 'Display name returned by Google for the OAuth identity that connected this tenant Google Ads integration.';

notify pgrst,'reload schema';
commit;
