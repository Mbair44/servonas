begin;

create table if not exists public.messaging_usage_plan_configs(
 plan_key text primary key,
 stripe_price_id text unique,
 included_outbound_sms_segments bigint not null default 0 check(included_outbound_sms_segments>=0),
 overage_unit text not null default 'outbound_sms_segment' check(overage_unit='outbound_sms_segment'),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
insert into public.messaging_usage_plan_configs(plan_key,included_outbound_sms_segments)
values('default',0) on conflict(plan_key) do nothing;

create unique index if not exists business_twilio_accounts_business_id_id_unique
 on public.business_twilio_accounts(business_id,id);

create table if not exists public.twilio_message_usage(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 business_twilio_account_id uuid not null references public.business_twilio_accounts(id) on delete restrict,
 twilio_account_sid text not null,
 twilio_message_sid text not null,
 direction text not null check(direction in('inbound','outbound-api','outbound-reply','outbound-call')),
 channel text not null default 'sms' check(channel in('sms','mms')),
 from_phone_e164 text,
 to_phone_e164 text,
 num_segments integer check(num_segments is null or num_segments>=0),
 num_media integer check(num_media is null or num_media>=0),
 message_status text not null default 'accepted',
 accepted_at timestamptz,
 sent_at timestamptz,
 delivered_at timestamptz,
 failed_at timestamptz,
 received_at timestamptz,
 provider_date_created timestamptz,
 provider_date_updated timestamptz,
 twilio_price numeric(18,8),
 twilio_price_unit text,
 provider_error_code text,
 messaging_service_sid text,
 phone_number_sid text references public.twilio_phone_numbers(twilio_phone_number_sid) on delete set null,
 billing_period_start date not null,
 source_type text,
 source_id text,
 usage_finalized_at timestamptz,
 last_provider_sync_at timestamptz,
 reconciliation_attempts integer not null default 0,
 next_reconciliation_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint twilio_usage_account_sid_format check(twilio_account_sid ~ '^AC[0-9A-Za-z]{32}$'),
 constraint twilio_usage_message_sid_format check(twilio_message_sid ~ '^(SM|MM)[0-9A-Za-z]{32}$'),
 constraint twilio_usage_messaging_service_sid_format check(messaging_service_sid is null or messaging_service_sid ~ '^MG[0-9A-Za-z]{32}$'),
 constraint twilio_usage_unique_message unique(twilio_account_sid,twilio_message_sid),
 constraint twilio_usage_tenant_account_fk foreign key(business_id,business_twilio_account_id)
  references public.business_twilio_accounts(business_id,id) on delete restrict
);
create index if not exists twilio_usage_business_period_idx on public.twilio_message_usage(business_id,billing_period_start);
create index if not exists twilio_usage_reconciliation_idx on public.twilio_message_usage(next_reconciliation_at,created_at)
 where usage_finalized_at is null;
create index if not exists twilio_usage_provider_message_idx on public.twilio_message_usage(twilio_message_sid);

create table if not exists public.business_messaging_billing_periods(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 period_start date not null,
 period_end date not null,
 plan_key text not null references public.messaging_usage_plan_configs(plan_key),
 included_units bigint not null default 0 check(included_units>=0),
 billable_units bigint not null default 0 check(billable_units>=0),
 overage_units bigint not null default 0 check(overage_units>=0),
 provider_cost numeric(18,8) not null default 0,
 provider_cost_currency text,
 unfinalized_message_count bigint not null default 0 check(unfinalized_message_count>=0),
 calculation_version integer not null default 1,
 status text not null default 'open' check(status in('open','calculated','finalized')),
 calculated_at timestamptz,
 finalized_at timestamptz,
 stripe_billing_status text not null default 'not_billed' check(stripe_billing_status='not_billed'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint messaging_period_bounds check(period_start=date_trunc('month',period_start::timestamp)::date and period_end=(period_start+interval '1 month')::date),
 constraint messaging_period_unique unique(business_id,period_start)
);
create index if not exists messaging_billing_period_business_idx on public.business_messaging_billing_periods(business_id,period_start desc);

alter table public.messaging_usage_plan_configs enable row level security;
alter table public.twilio_message_usage enable row level security;
alter table public.business_messaging_billing_periods enable row level security;
create policy "platform admins read messaging plan configuration" on public.messaging_usage_plan_configs for select to authenticated using(public.is_servonas_platform_admin());
create policy "business admins read own Twilio usage" on public.twilio_message_usage for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());
create policy "business admins read own messaging periods" on public.business_messaging_billing_periods for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());
revoke insert,update,delete on public.messaging_usage_plan_configs from anon,authenticated;
revoke insert,update,delete on public.twilio_message_usage from anon,authenticated;
revoke insert,update,delete on public.business_messaging_billing_periods from anon,authenticated;

comment on table public.twilio_message_usage is 'Canonical tenant Twilio message usage ledger. Existing source-specific communication records remain authoritative for product UX.';
comment on column public.twilio_message_usage.twilio_price is 'Provider-reported signed Twilio price. Customer billable units are calculated separately.';
comment on table public.business_messaging_billing_periods is 'Monthly included and overage unit snapshot. Phase 1 never creates Stripe usage or charges.';
notify pgrst, 'reload schema';
commit;
