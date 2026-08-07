alter table public.business_website_settings
  add column if not exists instagram_url text;

alter table public.business_website_settings
  drop constraint if exists business_website_instagram_url_check;

alter table public.business_website_settings
  add constraint business_website_instagram_url_check check (
    instagram_url is null
    or instagram_url ~ '^https://www\.instagram\.com/[A-Za-z0-9._]{1,30}/$'
  );

comment on column public.business_website_settings.instagram_url is
  'Validated public Instagram profile URL displayed on the generated business website.';
