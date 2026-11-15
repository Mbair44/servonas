-- Tenant-controlled structured-data visibility. A service-area business must
-- explicitly opt in before its stored street address is published.
begin;

alter table public.business_website_settings
  add column if not exists public_address_enabled boolean not null default false;

comment on column public.business_website_settings.public_address_enabled is
  'When true, expose the business address already stored in businesses as public LocalBusiness JSON-LD. Leave false for service-area businesses or hidden addresses.';

notify pgrst,'reload schema';
commit;
