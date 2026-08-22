begin;

alter table public.business_website_settings
 drop constraint if exists business_website_settings_photo_urls_check;

alter table public.business_website_settings
 add constraint business_website_settings_photo_urls_check
 check (cardinality(photo_urls) <= 24);

notify pgrst, 'reload schema';
commit;
