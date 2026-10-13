begin;

alter table public.business_website_settings
 add column if not exists google_ads_booking_conversion_destination text;

alter table public.business_website_settings
 drop constraint if exists business_website_settings_google_ads_booking_conversion_destination_check;
alter table public.business_website_settings
 add constraint business_website_settings_google_ads_booking_conversion_destination_check
 check (
  google_ads_booking_conversion_destination is null
  or (
   google_ads_tag_id is not null
   and google_ads_booking_conversion_destination ~ '^AW-[0-9]{6,20}/[A-Za-z0-9_-]{1,200}$'
   and split_part(google_ads_booking_conversion_destination,'/',1)=google_ads_tag_id
  )
 );

comment on column public.business_website_settings.google_ads_booking_conversion_destination is
 'Tenant-specific Google Ads booking-completed conversion destination. Fired only by a paid public booking success page after analytics consent.';

-- Configure only Copper State Bounce. Other tenants remain opted out until they
-- explicitly save a destination that matches their own Google Ads tag.
update public.business_website_settings
 set google_ads_tag_id='AW-18406171248',
     google_ads_booking_conversion_destination='AW-18406171248/dJbiCJve5ZodEPDE38hE'
 where business_id='cb25acc0-3623-4c06-9041-89a88f4ad6ed';

notify pgrst, 'reload schema';
commit;
