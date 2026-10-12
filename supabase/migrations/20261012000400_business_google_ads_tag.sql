begin;

alter table public.business_website_settings
 add column if not exists google_ads_tag_id text;
alter table public.business_website_settings
 add constraint business_website_settings_google_ads_tag_id_check
 check (google_ads_tag_id is null or google_ads_tag_id ~ '^AW-[0-9]{6,20}$');
comment on column public.business_website_settings.google_ads_tag_id is
 'Public tenant Google Ads destination ID. Loaded only after analytics consent.';

-- Configure only the existing Copper State Bounce website; no global default.
update public.business_website_settings
 set google_ads_tag_id='AW-18406171248'
 where business_id='cb25acc0-3623-4c06-9041-89a88f4ad6ed';

notify pgrst, 'reload schema';
commit;
