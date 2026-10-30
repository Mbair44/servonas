alter table public.business_website_settings
  add column if not exists seo_title text,
  add column if not exists seo_description text;

comment on column public.business_website_settings.seo_title is 'Optional tenant-scoped homepage search-result title.';
comment on column public.business_website_settings.seo_description is 'Optional tenant-scoped homepage search-result description.';
