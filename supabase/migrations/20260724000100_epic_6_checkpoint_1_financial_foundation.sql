-- Epic 6 Checkpoint 1: provider-neutral financial domain foundation.
-- Currency amounts are integer minor units (cents for USD). Percentages use
-- basis points (10000 = 100%). Browser-supplied aggregate totals are never
-- authoritative.

begin;

create table public.price_book_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id),
  constraint price_book_categories_name_check check (length(trim(name)) between 1 and 160)
);
create unique index price_book_categories_active_name_unique
  on public.price_book_categories(business_id,lower(name)) where not is_deleted;

create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  rate_basis_points integer not null default 0 check (rate_basis_points between 0 and 100000),
  is_active boolean not null default true,
  is_default boolean not null default false,
  jurisdiction_notes text,
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id)
);
create unique index tax_rates_one_active_default
  on public.tax_rates(business_id) where is_default and is_active and not is_deleted;

create table public.price_book_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid,
  service_id uuid,
  name text not null,
  description text,
  internal_description text,
  sku text,
  unit_type text not null default 'each',
  default_unit_price_cents bigint not null default 0 check (default_unit_price_cents >= 0),
  internal_cost_cents bigint not null default 0 check (internal_cost_cents >= 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  is_taxable boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes between 1 and 10080),
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id),
  constraint price_book_items_unit_type_check check (unit_type in ('each','hour','day','visit','foot','square_foot','flat_rate','custom')),
  constraint price_book_items_category_fk foreign key (business_id,category_id)
    references public.price_book_categories(business_id,id) on delete restrict,
  constraint price_book_items_service_fk foreign key (business_id,service_id)
    references public.services(business_id,id) on delete restrict
);
create index price_book_items_active_idx on public.price_book_items(business_id,is_active,category_id,sort_order) where not is_deleted;
create unique index price_book_items_sku_unique on public.price_book_items(business_id,lower(sku)) where sku is not null and not is_deleted;

create table public.financial_document_sequences (
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_type text not null check (document_type in ('estimate','invoice')),
  prefix text not null,
  next_value bigint not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now(),
  primary key (business_id,document_type)
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  estimate_number text not null,
  customer_id uuid not null,
  service_location_id uuid,
  job_id uuid,
  status text not null default 'draft' check (status in ('draft','sent','viewed','accepted','declined','expired','converted','void')),
  title text not null,
  customer_message text,
  internal_notes text,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_total_cents bigint not null default 0 check (discount_total_cents >= 0),
  tax_total_cents bigint not null default 0 check (tax_total_cents >= 0),
  fee_total_cents bigint not null default 0 check (fee_total_cents >= 0),
  grand_total_cents bigint not null default 0 check (grand_total_cents >= 0),
  deposit_type text not null default 'none' check (deposit_type in ('none','fixed','percentage')),
  deposit_value bigint not null default 0 check (deposit_value >= 0),
  deposit_required_cents bigint not null default 0 check (deposit_required_cents >= 0),
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  amount_refunded_cents bigint not null default 0 check (amount_refunded_cents >= 0),
  balance_due_cents bigint not null default 0 check (balance_due_cents >= 0),
  issue_date date,
  expiration_date date,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  voided_at timestamptz,
  accepted_by_name text,
  accepted_by_email text,
  accepted_version integer,
  decline_reason text,
  public_token_hash bytea,
  public_token_expires_at timestamptz,
  public_token_revoked_at timestamptz,
  version_number integer not null default 1 check (version_number > 0),
  converted_job_id uuid,
  conversion_key uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  voided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  unique (business_id,id),
  unique (business_id,estimate_number),
  unique (business_id,conversion_key),
  constraint estimates_customer_fk foreign key (business_id,customer_id) references public.customers(business_id,id),
  constraint estimates_location_fk foreign key (business_id,service_location_id) references public.service_locations(business_id,id),
  constraint estimates_job_fk foreign key (business_id,job_id) references public.jobs(business_id,id),
  constraint estimates_converted_job_fk foreign key (business_id,converted_job_id) references public.jobs(business_id,id),
  constraint estimates_dates_check check (expiration_date is null or issue_date is null or expiration_date >= issue_date),
  constraint estimates_deposit_percentage_check check ((deposit_type='percentage' and deposit_value <= 10000) or deposit_type <> 'percentage'),
  constraint estimates_paid_math_check check (amount_refunded_cents <= amount_paid_cents),
  constraint estimates_acceptance_check check (status <> 'accepted' or (accepted_at is not null and accepted_version is not null))
);
create unique index estimates_public_token_unique on public.estimates(public_token_hash) where public_token_hash is not null;
create index estimates_lookup_idx on public.estimates(business_id,status,created_at desc) where not is_deleted;
create index estimates_customer_idx on public.estimates(business_id,customer_id,created_at desc);
create index estimates_expiration_idx on public.estimates(business_id,expiration_date) where status in ('sent','viewed');

create table public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  estimate_id uuid not null,
  price_book_item_id uuid,
  service_id uuid,
  name_snapshot text not null,
  description_snapshot text,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_type_snapshot text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  internal_unit_cost_cents bigint not null default 0 check (internal_unit_cost_cents >= 0),
  discount_type text not null default 'none' check (discount_type in ('none','fixed','percentage')),
  discount_value bigint not null default 0 check (discount_value >= 0),
  line_discount_cents bigint not null default 0 check (line_discount_cents >= 0),
  is_taxable boolean not null default true,
  tax_rate_basis_points integer not null default 0 check (tax_rate_basis_points between 0 and 100000),
  line_subtotal_cents bigint not null check (line_subtotal_cents >= 0),
  tax_amount_cents bigint not null default 0 check (tax_amount_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id),
  constraint estimate_lines_estimate_fk foreign key (business_id,estimate_id) references public.estimates(business_id,id) on delete cascade,
  constraint estimate_lines_price_book_fk foreign key (business_id,price_book_item_id) references public.price_book_items(business_id,id),
  constraint estimate_lines_service_fk foreign key (business_id,service_id) references public.services(business_id,id),
  constraint estimate_lines_percent_check check (discount_type <> 'percentage' or discount_value <= 10000),
  constraint estimate_lines_discount_check check (line_discount_cents <= line_subtotal_cents)
);
create index estimate_line_items_estimate_idx on public.estimate_line_items(business_id,estimate_id,sort_order);

create table public.estimate_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  estimate_id uuid not null,
  version_number integer not null check (version_number > 0),
  document_snapshot jsonb not null check (jsonb_typeof(document_snapshot)='object'),
  line_items_snapshot jsonb not null check (jsonb_typeof(line_items_snapshot)='array'),
  snapshot_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id,estimate_id,version_number),
  constraint estimate_versions_estimate_fk foreign key (business_id,estimate_id) references public.estimates(business_id,id) on delete restrict
);

create table public.estimate_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  estimate_id uuid not null,
  event_type text not null check (event_type in ('created','updated','sent','viewed','accepted','declined','expired','converted_to_job','voided','payment_received','public_link_accessed')),
  actor_user_id uuid references auth.users(id) on delete set null,
  customer_actor_name text,
  customer_actor_email text,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  constraint estimate_events_estimate_fk foreign key (business_id,estimate_id) references public.estimates(business_id,id) on delete restrict
);
create index estimate_events_timeline_idx on public.estimate_events(business_id,estimate_id,created_at);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_number text not null,
  customer_id uuid not null,
  service_location_id uuid,
  job_id uuid,
  estimate_id uuid,
  status text not null default 'draft' check (status in ('draft','sent','viewed','partially_paid','paid','overdue','void','uncollectible','refunded')),
  title text not null,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  customer_notes text,
  internal_notes text,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_total_cents bigint not null default 0 check (discount_total_cents >= 0),
  tax_total_cents bigint not null default 0 check (tax_total_cents >= 0),
  fee_total_cents bigint not null default 0 check (fee_total_cents >= 0),
  grand_total_cents bigint not null default 0 check (grand_total_cents >= 0),
  deposit_type text not null default 'none' check (deposit_type in ('none','fixed','percentage')),
  deposit_value bigint not null default 0 check (deposit_value >= 0),
  deposit_required_cents bigint not null default 0 check (deposit_required_cents >= 0),
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  amount_refunded_cents bigint not null default 0 check (amount_refunded_cents >= 0),
  balance_due_cents bigint not null default 0 check (balance_due_cents >= 0),
  issue_date date,
  due_date date,
  sent_at timestamptz,
  viewed_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  public_token_hash bytea,
  public_token_expires_at timestamptz,
  public_token_revoked_at timestamptz,
  source_key uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  voided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  unique (business_id,id),
  unique (business_id,invoice_number),
  unique (business_id,source_key),
  constraint invoices_customer_fk foreign key (business_id,customer_id) references public.customers(business_id,id),
  constraint invoices_location_fk foreign key (business_id,service_location_id) references public.service_locations(business_id,id),
  constraint invoices_job_fk foreign key (business_id,job_id) references public.jobs(business_id,id),
  constraint invoices_estimate_fk foreign key (business_id,estimate_id) references public.estimates(business_id,id),
  constraint invoices_dates_check check (due_date is null or issue_date is null or due_date >= issue_date),
  constraint invoices_deposit_percentage_check check ((deposit_type='percentage' and deposit_value <= 10000) or deposit_type <> 'percentage'),
  constraint invoices_paid_math_check check (amount_refunded_cents <= amount_paid_cents),
  constraint invoices_paid_timestamp_check check (status <> 'paid' or paid_at is not null)
);
create unique index invoices_public_token_unique on public.invoices(public_token_hash) where public_token_hash is not null;
create index invoices_lookup_idx on public.invoices(business_id,status,created_at desc) where not is_deleted;
create index invoices_customer_idx on public.invoices(business_id,customer_id,created_at desc);
create index invoices_due_idx on public.invoices(business_id,due_date) where status in ('sent','viewed','partially_paid','overdue');

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null,
  price_book_item_id uuid,
  estimate_line_item_id uuid,
  service_id uuid,
  name_snapshot text not null,
  description_snapshot text,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_type_snapshot text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  internal_unit_cost_cents bigint not null default 0 check (internal_unit_cost_cents >= 0),
  discount_type text not null default 'none' check (discount_type in ('none','fixed','percentage')),
  discount_value bigint not null default 0 check (discount_value >= 0),
  line_discount_cents bigint not null default 0 check (line_discount_cents >= 0),
  is_taxable boolean not null default true,
  tax_rate_basis_points integer not null default 0 check (tax_rate_basis_points between 0 and 100000),
  line_subtotal_cents bigint not null check (line_subtotal_cents >= 0),
  tax_amount_cents bigint not null default 0 check (tax_amount_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id),
  constraint invoice_lines_invoice_fk foreign key (business_id,invoice_id) references public.invoices(business_id,id) on delete cascade,
  constraint invoice_lines_price_book_fk foreign key (business_id,price_book_item_id) references public.price_book_items(business_id,id),
  constraint invoice_lines_estimate_line_fk foreign key (business_id,estimate_line_item_id) references public.estimate_line_items(business_id,id),
  constraint invoice_lines_service_fk foreign key (business_id,service_id) references public.services(business_id,id),
  constraint invoice_lines_percent_check check (discount_type <> 'percentage' or discount_value <= 10000),
  constraint invoice_lines_discount_check check (line_discount_cents <= line_subtotal_cents)
);
create index invoice_line_items_invoice_idx on public.invoice_line_items(business_id,invoice_id,sort_order);

create table public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null,
  event_type text not null check (event_type in ('created','updated','sent','viewed','payment_initiated','payment_succeeded','payment_failed','partial_payment','paid','overdue','voided','refund_initiated','refund_succeeded','refund_failed','offline_payment_recorded','receipt_sent')),
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  constraint invoice_events_invoice_fk foreign key (business_id,invoice_id) references public.invoices(business_id,id) on delete restrict
);
create index invoice_events_timeline_idx on public.invoice_events(business_id,invoice_id,created_at);

-- Extend the original booking payment ledger instead of replacing it.
-- booking_id, provider_payment_id, and raw_event remain for compatibility.
alter table public.payments alter column booking_id drop not null;
alter table public.payments alter column amount_cents type bigint using amount_cents::bigint;
alter table public.payments
  add column if not exists business_id uuid references public.businesses(id) on delete restrict,
  add column if not exists customer_id uuid,
  add column if not exists invoice_id uuid,
  add column if not exists estimate_id uuid,
  add column if not exists job_id uuid,
  add column if not exists provider_account_id text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_payment_intent_id text,
  add column if not exists provider_checkout_session_id text,
  add column if not exists provider_charge_id text,
  add column if not exists idempotency_key text,
  add column if not exists payment_method_type text,
  add column if not exists currency char(3) not null default 'USD',
  add column if not exists refunded_amount_cents bigint not null default 0,
  add column if not exists processing_fee_cents bigint not null default 0,
  add column if not exists platform_fee_cents bigint not null default 0,
  add column if not exists net_amount_cents bigint not null default 0,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists paid_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists recorded_by uuid references auth.users(id) on delete set null,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists received_at timestamptz,
  add column if not exists offline_reference text,
  add column if not exists offline_notes text,
  add column if not exists attachment_path text;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending','requires_action','processing','succeeded','failed','canceled','partially_refunded','refunded','void'));
alter table public.payments add constraint payments_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.payments add constraint payments_provider_check check (provider in ('stripe','offline'));
alter table public.payments add constraint payments_refunded_amount_check check (refunded_amount_cents >= 0 and refunded_amount_cents <= amount_cents);
alter table public.payments add constraint payments_fee_math_check check (
  processing_fee_cents >= 0 and platform_fee_cents >= 0 and
  processing_fee_cents + platform_fee_cents <= amount_cents
);
alter table public.payments add constraint payments_net_amount_check check (net_amount_cents >= 0);
alter table public.payments add constraint payments_financial_record_check check (
  booking_id is not null or (
    business_id is not null and customer_id is not null and
    idempotency_key is not null and amount_cents > 0
  )
);
alter table public.payments add constraint payments_paid_timestamp_check
  check (business_id is null or status <> 'succeeded' or paid_at is not null);
alter table public.payments add constraint payments_offline_fields_check
  check (provider <> 'offline' or (
    payment_method_type in ('cash','check','bank_transfer','external_card_terminal','other')
    and received_at is not null
  ));
alter table public.payments add constraint payments_business_id_id_unique unique (business_id,id);
alter table public.payments add constraint payments_business_idempotency_unique unique (business_id,idempotency_key);
alter table public.payments add constraint payments_customer_fk foreign key (business_id,customer_id) references public.customers(business_id,id);
alter table public.payments add constraint payments_invoice_fk foreign key (business_id,invoice_id) references public.invoices(business_id,id);
alter table public.payments add constraint payments_estimate_fk foreign key (business_id,estimate_id) references public.estimates(business_id,id);
alter table public.payments add constraint payments_job_fk foreign key (business_id,job_id) references public.jobs(business_id,id);
comment on column public.payments.raw_event is
  'Legacy compatibility only. New webhook processing stores hashes and safe metadata in payment_webhook_events.';
create unique index payments_provider_intent_unique on public.payments(provider,provider_account_id,provider_payment_intent_id) where provider_payment_intent_id is not null;
create index payments_invoice_idx on public.payments(business_id,invoice_id,created_at desc);
create index payments_customer_idx on public.payments(business_id,customer_id,created_at desc);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  payment_id uuid not null,
  provider_refund_id text,
  idempotency_key text not null,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','canceled')),
  reason text,
  internal_notes text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  failure_message text,
  unique (business_id,id),
  unique (business_id,idempotency_key),
  constraint refunds_payment_fk foreign key (business_id,payment_id) references public.payments(business_id,id) on delete restrict,
  constraint refunds_completed_check check (status <> 'succeeded' or completed_at is not null)
);
create unique index payment_refunds_provider_unique on public.payment_refunds(provider_refund_id) where provider_refund_id is not null;
create index payment_refunds_payment_idx on public.payment_refunds(business_id,payment_id,requested_at desc);

create table public.business_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe')),
  provider_account_id text,
  account_type text not null default 'express' check (account_type in ('standard','express','custom')),
  onboarding_status text not null default 'not_started' check (onboarding_status in ('not_started','pending','restricted','complete','disabled')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  default_currency char(3) not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  country char(2) not null default 'US' check (country ~ '^[A-Z]{2}$'),
  last_provider_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,provider),
  unique (provider,provider_account_id)
);

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe')),
  provider_event_id text not null,
  provider_account_id text,
  event_type text not null,
  processing_status text not null default 'pending' check (processing_status in ('pending','processing','processed','failed','ignored')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  payload_hash text not null,
  safe_metadata jsonb not null default '{}' check (jsonb_typeof(safe_metadata)='object'),
  unique (provider,provider_event_id)
);
create index payment_webhook_account_idx on public.payment_webhook_events(provider,provider_account_id,received_at desc);
create index payment_webhook_pending_idx on public.payment_webhook_events(processing_status,received_at) where processing_status in ('pending','failed');

create or replace function public.next_financial_document_number(
  p_business_id uuid,
  p_document_type text
) returns text
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_value bigint;
  v_prefix text;
begin
  if p_document_type not in ('estimate','invoice') then
    raise exception 'Unsupported financial document type' using errcode='22023';
  end if;
  if not public.has_business_role(p_business_id,array['owner','admin','manager']) then
    raise exception 'Financial document numbering denied' using errcode='42501';
  end if;
  insert into public.financial_document_sequences(business_id,document_type,prefix,next_value)
  values (p_business_id,p_document_type,case when p_document_type='estimate' then 'EST-' else 'INV-' end,2)
  on conflict (business_id,document_type) do update
    set next_value=financial_document_sequences.next_value+1,updated_at=now()
  returning next_value-1,prefix into v_value,v_prefix;
  return v_prefix || lpad(v_value::text,6,'0');
end; $$;
revoke all on function public.next_financial_document_number(uuid,text) from public;
grant execute on function public.next_financial_document_number(uuid,text) to authenticated;

create or replace function public.protect_financial_document()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='estimates' and old.status in ('accepted','converted','void') and (
    new.currency,new.subtotal_cents,new.discount_total_cents,new.tax_total_cents,
    new.fee_total_cents,new.grand_total_cents,new.deposit_required_cents
  ) is distinct from (
    old.currency,old.subtotal_cents,old.discount_total_cents,old.tax_total_cents,
    old.fee_total_cents,old.grand_total_cents,old.deposit_required_cents
  ) then
    raise exception 'Accepted, converted, or void estimates are financially immutable' using errcode='23514';
  end if;
  if tg_table_name='invoices' and old.status in ('paid','refunded','void') and (
    new.currency,new.subtotal_cents,new.discount_total_cents,new.tax_total_cents,
    new.fee_total_cents,new.grand_total_cents
  ) is distinct from (
    old.currency,old.subtotal_cents,old.discount_total_cents,old.tax_total_cents,
    old.fee_total_cents,old.grand_total_cents
  ) then
    raise exception 'Paid, refunded, or void invoices are financially immutable' using errcode='23514';
  end if;
  new.updated_at=now();
  return new;
end; $$;
create trigger estimates_financial_guard before update on public.estimates
for each row execute function public.protect_financial_document();
create trigger invoices_financial_guard before update on public.invoices
for each row execute function public.protect_financial_document();

create or replace function public.prevent_financial_activity_delete()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'Financial activity records cannot be deleted' using errcode='23514';
end; $$;
create trigger payments_no_delete before delete on public.payments
for each row execute function public.prevent_financial_activity_delete();
create trigger refunds_no_delete before delete on public.payment_refunds
for each row execute function public.prevent_financial_activity_delete();
create trigger estimate_versions_no_delete before delete on public.estimate_versions
for each row execute function public.prevent_financial_activity_delete();

create or replace function public.set_financial_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end; $$;
create trigger price_book_categories_updated_at before update on public.price_book_categories for each row execute function public.set_financial_updated_at();
create trigger tax_rates_updated_at before update on public.tax_rates for each row execute function public.set_financial_updated_at();
create trigger price_book_items_updated_at before update on public.price_book_items for each row execute function public.set_financial_updated_at();
create trigger estimate_lines_updated_at before update on public.estimate_line_items for each row execute function public.set_financial_updated_at();
create trigger invoice_lines_updated_at before update on public.invoice_line_items for each row execute function public.set_financial_updated_at();
create trigger payments_updated_at before update on public.payments for each row execute function public.set_financial_updated_at();
create trigger payment_accounts_updated_at before update on public.business_payment_accounts for each row execute function public.set_financial_updated_at();

create or replace function public.enforce_refund_limit()
returns trigger language plpgsql set search_path=public as $$
declare
  v_payment_amount bigint;
  v_other_refunds bigint;
begin
  select amount_cents into v_payment_amount
  from public.payments
  where id=new.payment_id and business_id=new.business_id
  for update;
  if v_payment_amount is null then
    raise exception 'Payment does not belong to this business' using errcode='23503';
  end if;
  select coalesce(sum(amount_cents),0) into v_other_refunds
  from public.payment_refunds
  where payment_id=new.payment_id
    and business_id=new.business_id
    and status in ('pending','succeeded')
    and id<>new.id;
  if v_other_refunds + new.amount_cents > v_payment_amount then
    raise exception 'Refund total cannot exceed captured payment amount' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger payment_refunds_limit before insert or update on public.payment_refunds
for each row execute function public.enforce_refund_limit();

-- Office financial access is deliberately distinct from technician access.
-- Only owner/admin/manager roles receive policies in Checkpoint 1. Public
-- document access will use hashed tokens through server-side service-role code.
do $$
declare t text;
begin
  foreach t in array array[
    'price_book_categories','tax_rates','price_book_items',
    'financial_document_sequences','estimates','estimate_line_items',
    'estimate_versions','estimate_events','invoices','invoice_line_items',
    'invoice_events','payments','payment_refunds','business_payment_accounts'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_business_role(business_id,array[''owner'',''admin'',''manager'']))',
      'financial office reads '||t,t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_business_role(business_id,array[''owner'',''admin'',''manager'']))',
      'financial office creates '||t,t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_business_role(business_id,array[''owner'',''admin'',''manager''])) with check (public.has_business_role(business_id,array[''owner'',''admin'',''manager'']))',
      'financial office updates '||t,t
    );
  end loop;
end $$;

alter table public.payment_webhook_events enable row level security;
-- No authenticated-client policy: webhook ingestion/processing is server-only.

comment on table public.estimate_versions is
  'Immutable JSON snapshots. A material revision after send creates the next version; acceptance records accepted_version.';
comment on column public.estimates.public_token_hash is
  'SHA-256 hash of a high-entropy token. Raw customer-access tokens are never stored.';
comment on column public.invoices.public_token_hash is
  'SHA-256 hash of a high-entropy token. Raw customer-access tokens are never stored.';
comment on table public.payment_webhook_events is
  'Provider-neutral idempotency ledger. Stores a payload hash and limited safe metadata, never raw payment credentials.';

commit;
