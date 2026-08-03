begin;

alter table public.business_website_settings
 add column if not exists google_reviews jsonb not null default '[]'::jsonb;

alter table public.business_website_settings
 drop constraint if exists business_website_google_reviews_check;

alter table public.business_website_settings
 add constraint business_website_google_reviews_check check(
  jsonb_typeof(google_reviews)='array'
  and jsonb_array_length(google_reviews)<=6
 );

comment on column public.business_website_settings.google_reviews is
 'Business-curated Google review excerpts, limited to six; author, rating, and text are validated by the application.';

notify pgrst, 'reload schema';
commit;
