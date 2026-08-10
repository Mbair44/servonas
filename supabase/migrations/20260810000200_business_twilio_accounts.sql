begin;

create table if not exists public.business_twilio_accounts(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 twilio_subaccount_sid text,
 twilio_subaccount_friendly_name text,
 twilio_subaccount_status text,
 provisioning_status text not null default 'not_started',
 provisioning_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_synced_at timestamptz,
 constraint business_twilio_accounts_business_unique unique(business_id),
 constraint business_twilio_accounts_sid_unique unique(twilio_subaccount_sid),
 constraint business_twilio_accounts_sid_format check(twilio_subaccount_sid is null or twilio_subaccount_sid ~ '^AC[0-9A-Za-z]{32}$'),
 constraint business_twilio_accounts_provisioning_status_check check(provisioning_status in('not_started','provisioning','active','failed','suspended'))
);

create index if not exists business_twilio_accounts_provisioning_status_idx
 on public.business_twilio_accounts(provisioning_status);

alter table public.business_twilio_accounts enable row level security;

drop policy if exists "business admins read own Twilio account status" on public.business_twilio_accounts;
create policy "business admins read own Twilio account status"
 on public.business_twilio_accounts for select to authenticated
 using(
  public.has_business_role(business_id,array['owner','admin'])
  or public.is_servonas_platform_admin()
 );

-- Writes intentionally have no authenticated policy. Provisioning writes use the
-- server-only service role after the caller passes the platform-admin check.
revoke insert,update,delete on public.business_twilio_accounts from anon,authenticated;

comment on table public.business_twilio_accounts is
 'One non-secret Twilio subaccount record per Servonas business. Future phone, Messaging Service, Trust Hub, and A2P resources belong in separate tables.';
comment on column public.business_twilio_accounts.provisioning_error is
 'Sanitized operational error only. Never store credentials or raw authorization headers.';

notify pgrst, 'reload schema';
commit;
