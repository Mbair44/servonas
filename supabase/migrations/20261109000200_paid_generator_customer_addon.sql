-- A generator is a customer-selectable power add-on, not a rentable catalog item.
alter table public.job_addon_catalog
  add column if not exists is_power_generator boolean not null default false;

create unique index if not exists job_addon_catalog_one_power_generator_per_business
  on public.job_addon_catalog(business_id) where is_power_generator;

-- Copper State Bounce already has the $150 staff-only Generator Rental catalog item.
-- Promote it to the paid customer choice used by the booking power question.
update public.job_addon_catalog
set is_power_generator=true,
    customer_visible=true,
    visibility='public_future',
    max_customer_quantity=1,
    compatibility_required=false,
    is_active=true,
    updated_at=now()
where business_id='cb25acc0-3623-4c06-9041-89a88f4ad6ed'
  and lower(name)='generator rental';

insert into public.job_addon_catalog(
  business_id,name,description,default_unit_price_cents,is_taxable,visibility,
  is_active,customer_visible,max_customer_quantity,compatibility_required,is_power_generator
)
select 'cb25acc0-3623-4c06-9041-89a88f4ad6ed','Generator Rental',
  'Portable generator for rentals without suitable electrical power.',15000,true,
  'public_future',true,true,1,false,true
where not exists (
  select 1 from public.job_addon_catalog
  where business_id='cb25acc0-3623-4c06-9041-89a88f4ad6ed' and is_power_generator
);
