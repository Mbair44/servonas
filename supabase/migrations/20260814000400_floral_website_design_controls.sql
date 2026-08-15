alter table public.business_website_settings
  add column if not exists floral_font_style text not null default 'elegant',
  add column if not exists floral_accent_color text not null default '#b85c7c',
  add column if not exists floral_background_color text not null default '#fffafc',
  add column if not exists floral_photo_layout text not null default 'hero_right';

alter table public.business_website_settings
  drop constraint if exists business_website_settings_floral_font_style_check,
  add constraint business_website_settings_floral_font_style_check check (floral_font_style in ('elegant','romantic','modern')),
  drop constraint if exists business_website_settings_floral_photo_layout_check,
  add constraint business_website_settings_floral_photo_layout_check check (floral_photo_layout in ('hero_right','hero_left','hero_full','gallery_first')),
  drop constraint if exists business_website_settings_floral_accent_color_check,
  add constraint business_website_settings_floral_accent_color_check check (floral_accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  drop constraint if exists business_website_settings_floral_background_color_check,
  add constraint business_website_settings_floral_background_color_check check (floral_background_color ~ '^#[0-9A-Fa-f]{6}$');
