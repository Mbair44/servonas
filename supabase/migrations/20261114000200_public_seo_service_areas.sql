-- Public SEO coverage is deliberately separate from operational workforce territories.
-- A tenant must explicitly configure city/state pairs before they appear in JSON-LD.
begin;

alter table public.business_website_settings
  add column if not exists public_seo_service_areas jsonb not null default '[]'::jsonb;

create or replace function public.public_seo_service_areas_are_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_typeof(value) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(value) as area
      where jsonb_typeof(area) <> 'object'
        or jsonb_typeof(area->'city') <> 'string'
        or jsonb_typeof(area->'state') <> 'string'
        or not (area->>'city' ~ '^[A-Za-z][A-Za-z .''-]{0,78}$')
        or lower(area->>'state') not in (
          'al','alabama','ak','alaska','az','arizona','ar','arkansas','ca','california','co','colorado','ct','connecticut','de','delaware','fl','florida','ga','georgia','hi','hawaii','id','idaho','il','illinois','in','indiana','ia','iowa','ks','kansas','ky','kentucky','la','louisiana','me','maine','md','maryland','ma','massachusetts','mi','michigan','mn','minnesota','ms','mississippi','mo','missouri','mt','montana','ne','nebraska','nv','nevada','nh','new hampshire','nj','new jersey','nm','new mexico','ny','new york','nc','north carolina','nd','north dakota','oh','ohio','ok','oklahoma','or','oregon','pa','pennsylvania','ri','rhode island','sc','south carolina','sd','south dakota','tn','tennessee','tx','texas','ut','utah','vt','vermont','va','virginia','wa','washington','wv','west virginia','wi','wisconsin','wy','wyoming','dc','district of columbia'
        )
    );
$$;

alter table public.business_website_settings
  drop constraint if exists business_website_settings_public_seo_service_areas_array_check;

alter table public.business_website_settings
  add constraint business_website_settings_public_seo_service_areas_array_check
  check (public.public_seo_service_areas_are_valid(public_seo_service_areas));

comment on column public.business_website_settings.public_seo_service_areas is
  'Optional tenant-scoped public SEO city/state pairs. Empty means omit LocalBusiness areaServed.';

notify pgrst,'reload schema';
commit;
