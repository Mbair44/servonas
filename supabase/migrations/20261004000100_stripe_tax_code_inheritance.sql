-- Rental tax-code inheritance is evaluated only for new public checkout quotes.
-- Existing items and historical booking tax snapshots are intentionally untouched.
begin;

alter table public.business_billing_settings
  add column if not exists default_stripe_tax_code text;

alter table public.rental_inventory_categories
  add column if not exists tax_code text;

comment on column public.business_billing_settings.default_stripe_tax_code is
  'Default Stripe Tax code for taxable rental inventory. Item and category values override this for new quotes.';
comment on column public.rental_inventory_categories.tax_code is
  'Optional Stripe Tax code override for rental items in this category. Item values override this for new quotes.';
comment on column public.inventory_items.tax_code is
  'Optional Stripe Tax code override for this rental item. Null inherits category then business default for new quotes.';

commit;
