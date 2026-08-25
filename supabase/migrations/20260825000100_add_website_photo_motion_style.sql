alter table public.business_website_settings
  add column if not exists photo_motion_style text not null default 'static';

alter table public.business_website_settings
  drop constraint if exists business_website_settings_photo_motion_style_check,
  add constraint business_website_settings_photo_motion_style_check
  check (photo_motion_style in ('static','ken_burns'));

comment on column public.business_website_settings.photo_motion_style is
  'Controls how uploaded website photos are presented on the public website.';
