begin;

alter table public.business_website_settings
 add column if not exists google_place_id text,
 add column if not exists google_place_name text,
 add column if not exists google_place_address text;

alter table public.business_website_settings
 add constraint business_website_google_place_id_check check(google_place_id is null or length(google_place_id) between 10 and 255),
 add constraint business_website_google_place_name_check check(google_place_name is null or length(google_place_name)<=300),
 add constraint business_website_google_place_address_check check(google_place_address is null or length(google_place_address)<=500);

comment on column public.business_website_settings.google_place_id is
 'Google Places identifier used to retrieve current rating data; Place IDs are permitted to be stored.';

notify pgrst, 'reload schema';
commit;
