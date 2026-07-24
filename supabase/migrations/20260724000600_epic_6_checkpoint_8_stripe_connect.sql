-- Epic 6 Checkpoint 8: Stripe Connect onboarding and restriction state.
begin;

alter table public.business_payment_accounts
  add column if not exists requirements_currently_due text[] not null default '{}',
  add column if not exists requirements_eventually_due text[] not null default '{}',
  add column if not exists requirements_past_due text[] not null default '{}',
  add column if not exists disabled_reason text,
  add column if not exists capabilities jsonb not null default '{}',
  add column if not exists provider_created_at timestamptz,
  add column if not exists disconnected_at timestamptz,
  add column if not exists last_provider_error text;

alter table public.business_payment_accounts add constraint payment_accounts_capabilities_object_check
  check (jsonb_typeof(capabilities)='object');

comment on column public.business_payment_accounts.last_provider_error is
  'Safe provider diagnostic for authorized business administrators; never exposed in the public invoice portal.';
comment on column public.business_payment_accounts.provider_account_id is
  'Stripe connected-account ID. Globally unique per provider and always resolved with the tenant business_id in application workflows.';

commit;
