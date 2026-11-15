alter table public.business_website_settings
 drop constraint if exists business_website_settings_google_site_verification_token_check;

alter table public.business_website_settings
 add constraint business_website_settings_google_site_verification_token_check
 check (
  google_site_verification_token is null
  or (
   char_length(google_site_verification_token) between 8 and 256
   and google_site_verification_token ~ '^[A-Za-z0-9_-]+$'
  )
 );

notify pgrst, 'reload schema';
