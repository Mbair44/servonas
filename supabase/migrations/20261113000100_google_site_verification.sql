alter table public.business_website_settings
 add column if not exists google_site_verification_token text;

alter table public.business_website_settings
 drop constraint if exists business_website_settings_google_site_verification_token_check;

alter table public.business_website_settings
 add constraint business_website_settings_google_site_verification_token_check
 check (google_site_verification_token is null or google_site_verification_token ~ '^[A-Za-z0-9_-]{8,256}$');

notify pgrst, 'reload schema';
