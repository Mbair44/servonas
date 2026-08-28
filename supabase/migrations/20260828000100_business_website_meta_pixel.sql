begin;

alter table public.business_website_settings
 add column if not exists meta_pixel_id text;

alter table public.business_website_settings
 drop constraint if exists business_website_settings_meta_pixel_id_check,
 add constraint business_website_settings_meta_pixel_id_check
 check (
  meta_pixel_id is null
  or btrim(meta_pixel_id) ~ '^[0-9]{8,24}$'
 );

comment on column public.business_website_settings.meta_pixel_id is
 'Optional tenant-scoped Meta Pixel ID for the public customer website only.';

notify pgrst, 'reload schema';
commit;
