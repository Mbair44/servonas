-- Existing tenants retain consent-gated Meta measurement unless enabled here.
alter table public.business_website_settings
 add column if not exists meta_pixel_default_measurement_enabled boolean not null default false;

comment on column public.business_website_settings.meta_pixel_default_measurement_enabled is
 'When true, the configured Meta Pixel measures by default until a visitor explicitly opts out.';

-- Approved tenant-specific policy for Copper State Bounce only.
update public.business_website_settings
 set meta_pixel_default_measurement_enabled=true
 where public_slug='copper-state-bounce'
   and meta_pixel_id='2375527282981645';
