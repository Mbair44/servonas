-- Sales tax phase 1: manual business tax settings, customer exemptions,
-- immutable invoice tax snapshots, and provider-ready tax metadata.
begin;

alter table public.business_billing_settings
  add column if not exists tax_calculation_method text not null default 'manual',
  add column if not exists tax_display_mode text not null default 'exclusive',
  add column if not exists default_invoice_item_taxable boolean not null default true;
alter table public.business_billing_settings
  drop constraint if exists business_billing_settings_tax_calculation_method_check;
alter table public.business_billing_settings
  add constraint business_billing_settings_tax_calculation_method_check
  check (tax_calculation_method in ('manual','automatic'));
alter table public.business_billing_settings
  drop constraint if exists business_billing_settings_tax_display_mode_check;
alter table public.business_billing_settings
  add constraint business_billing_settings_tax_display_mode_check
  check (tax_display_mode in ('exclusive','inclusive'));

alter table public.customers
  add column if not exists tax_exempt boolean not null default false,
  add column if not exists tax_exemption_reference text;

alter table public.price_book_items
  add column if not exists tax_code text;

alter table public.invoices
  add column if not exists tax_calculation_method text,
  add column if not exists tax_display_mode text,
  add column if not exists tax_rate_basis_points integer not null default 0,
  add column if not exists taxable_subtotal_cents bigint not null default 0,
  add column if not exists tax_provider text,
  add column if not exists tax_source text,
  add column if not exists tax_jurisdiction text,
  add column if not exists external_tax_calculation_id text,
  add column if not exists tax_calculated_at timestamptz,
  add column if not exists tax_customer_exempt boolean not null default false,
  add column if not exists tax_exemption_reference_snapshot text,
  add column if not exists tax_provider_metadata jsonb not null default '{}'::jsonb,
  add column if not exists tax_source_address_snapshot jsonb;
alter table public.invoices
  drop constraint if exists invoices_tax_calculation_method_check;
alter table public.invoices
  add constraint invoices_tax_calculation_method_check
  check (tax_calculation_method is null or tax_calculation_method in ('manual','automatic'));
alter table public.invoices
  drop constraint if exists invoices_tax_display_mode_check;
alter table public.invoices
  add constraint invoices_tax_display_mode_check
  check (tax_display_mode is null or tax_display_mode in ('exclusive','inclusive'));
alter table public.invoices
  drop constraint if exists invoices_tax_provider_check;
alter table public.invoices
  add constraint invoices_tax_provider_check
  check (tax_provider is null or tax_provider in ('manual','stripe_tax','other'));
alter table public.invoices
  drop constraint if exists invoices_tax_source_check;
alter table public.invoices
  add constraint invoices_tax_source_check
  check (tax_source is null or tax_source in ('manual_business_rate','customer_exempt','tax_disabled','provider'));
alter table public.invoices
  drop constraint if exists invoices_taxable_subtotal_nonnegative_check;
alter table public.invoices
  add constraint invoices_taxable_subtotal_nonnegative_check
  check (taxable_subtotal_cents >= 0);
alter table public.invoices
  drop constraint if exists invoices_tax_rate_basis_points_check;
alter table public.invoices
  add constraint invoices_tax_rate_basis_points_check
  check (tax_rate_basis_points between 0 and 10000);
alter table public.invoices
  drop constraint if exists invoices_tax_provider_metadata_check;
alter table public.invoices
  add constraint invoices_tax_provider_metadata_check
  check (jsonb_typeof(tax_provider_metadata) = 'object');
alter table public.invoices
  drop constraint if exists invoices_tax_source_address_snapshot_check;
alter table public.invoices
  add constraint invoices_tax_source_address_snapshot_check
  check (tax_source_address_snapshot is null or jsonb_typeof(tax_source_address_snapshot) = 'object');

alter table public.invoice_line_items
  add column if not exists taxable_amount_cents bigint not null default 0,
  add column if not exists tax_code_snapshot text,
  add column if not exists tax_provider_metadata jsonb not null default '{}'::jsonb,
  add column if not exists tax_source text,
  add column if not exists external_tax_calculation_id text;
alter table public.invoice_line_items
  drop constraint if exists invoice_line_items_taxable_amount_nonnegative_check;
alter table public.invoice_line_items
  add constraint invoice_line_items_taxable_amount_nonnegative_check
  check (taxable_amount_cents >= 0);
alter table public.invoice_line_items
  drop constraint if exists invoice_line_items_tax_provider_metadata_check;
alter table public.invoice_line_items
  add constraint invoice_line_items_tax_provider_metadata_check
  check (jsonb_typeof(tax_provider_metadata) = 'object');
alter table public.invoice_line_items
  drop constraint if exists invoice_line_items_tax_source_check;
alter table public.invoice_line_items
  add constraint invoice_line_items_tax_source_check
  check (tax_source is null or tax_source in ('manual_business_rate','customer_exempt','tax_disabled','provider'));

update public.business_billing_settings
set
  tax_calculation_method = coalesce(tax_calculation_method, 'manual'),
  tax_display_mode = coalesce(tax_display_mode, 'exclusive'),
  default_invoice_item_taxable = coalesce(default_invoice_item_taxable, true);

update public.invoices
set
  tax_calculation_method = coalesce(tax_calculation_method, 'manual'),
  tax_display_mode = coalesce(tax_display_mode, 'exclusive'),
  taxable_subtotal_cents = coalesce(taxable_subtotal_cents, 0),
  tax_provider = coalesce(tax_provider, 'manual'),
  tax_source = coalesce(
    tax_source,
    case
      when coalesce(tax_total_cents, 0) > 0 then 'manual_business_rate'
      else 'tax_disabled'
    end
  ),
  tax_calculated_at = coalesce(tax_calculated_at, coalesce(sent_at, created_at, now())),
  tax_provider_metadata = coalesce(tax_provider_metadata, '{}'::jsonb)
where
  tax_calculation_method is null
  or tax_display_mode is null
  or tax_provider is null
  or tax_source is null
  or tax_calculated_at is null
  or tax_provider_metadata is null;

update public.invoice_line_items
set
  taxable_amount_cents = coalesce(
    taxable_amount_cents,
    case when is_taxable then greatest(line_total_cents - tax_amount_cents, 0) else 0 end
  ),
  tax_provider_metadata = coalesce(tax_provider_metadata, '{}'::jsonb),
  tax_source = coalesce(
    tax_source,
    case when is_taxable and coalesce(tax_amount_cents, 0) > 0 then 'manual_business_rate' else 'tax_disabled' end
  )
where taxable_amount_cents is null or tax_provider_metadata is null or tax_source is null;

create index if not exists invoices_tax_reporting_idx
  on public.invoices (business_id, issue_date, tax_provider, tax_source);
create index if not exists customers_tax_exempt_idx
  on public.customers (business_id, tax_exempt)
  where not is_deleted;

comment on column public.business_billing_settings.tax_calculation_method is
  'Phase 1 uses manual. Phase 2 may use automatic provider-based calculation without redesigning invoices.';
comment on column public.invoices.tax_provider_metadata is
  'Provider-specific immutable tax payload used for future reporting and auditability.';
comment on column public.invoices.tax_source_address_snapshot is
  'Immutable address snapshot used when a provider or manual workflow determines invoice tax.';

commit;
