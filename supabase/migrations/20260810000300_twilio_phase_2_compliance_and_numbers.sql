begin;

create table if not exists public.twilio_compliance_registrations(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 business_twilio_account_id uuid not null references public.business_twilio_accounts(id) on delete cascade,
 twilio_customer_profile_sid text,
 twilio_end_user_sid text,
 twilio_trust_product_sid text,
 twilio_brand_sid text,
 registration_type text not null default 'secondary_customer_profile',
 status text not null default 'draft',
 status_reason text,
 twilio_error_code text,
 twilio_error_message_sanitized text,
 submitted_at timestamptz,
 approved_at timestamptz,
 rejected_at timestamptz,
 last_synced_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint twilio_compliance_business_type_unique unique(business_id,registration_type),
 constraint twilio_compliance_profile_sid_unique unique(twilio_customer_profile_sid),
 constraint twilio_compliance_profile_sid_format check(twilio_customer_profile_sid is null or twilio_customer_profile_sid ~ '^BU[0-9A-Za-z]{32}$'),
 constraint twilio_compliance_end_user_sid_format check(twilio_end_user_sid is null or twilio_end_user_sid ~ '^IT[0-9A-Za-z]{32}$'),
 constraint twilio_compliance_status_check check(status in('draft','pending_review','in_review','approved','rejected','failed','suspended'))
);

create table if not exists public.twilio_phone_numbers(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 business_twilio_account_id uuid not null references public.business_twilio_accounts(id) on delete cascade,
 twilio_phone_number_sid text,
 phone_number_e164 text not null,
 friendly_name text,
 area_code text,
 locality text,
 region text,
 country text not null default 'US',
 sms_capable boolean not null default true,
 mms_capable boolean not null default false,
 voice_capable boolean not null default false,
 is_primary boolean not null default true,
 status text not null default 'active',
 provisioning_status text not null default 'provisioning',
 provisioning_error text,
 inbound_sms_webhook_configured boolean not null default false,
 voice_webhook_configured boolean not null default false,
 messaging_service_sid text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_synced_at timestamptz,
 constraint twilio_phone_number_sid_unique unique(twilio_phone_number_sid),
 constraint twilio_phone_e164_unique unique(phone_number_e164),
 constraint twilio_phone_sid_format check(twilio_phone_number_sid is null or twilio_phone_number_sid ~ '^PN[0-9A-Za-z]{32}$'),
 constraint twilio_phone_e164_format check(phone_number_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 constraint twilio_phone_status_check check(status in('active','released','suspended')),
 constraint twilio_phone_provisioning_status_check check(provisioning_status in('provisioning','pending_webhook_security','active','failed'))
);

create index if not exists twilio_compliance_business_status_idx on public.twilio_compliance_registrations(business_id,status);
create index if not exists twilio_compliance_account_idx on public.twilio_compliance_registrations(business_twilio_account_id);
create index if not exists twilio_phone_business_status_idx on public.twilio_phone_numbers(business_id,status);
create index if not exists twilio_phone_account_idx on public.twilio_phone_numbers(business_twilio_account_id);
create unique index if not exists twilio_phone_one_primary_per_business_idx
 on public.twilio_phone_numbers(business_id) where is_primary and status='active';

alter table public.twilio_compliance_registrations enable row level security;
alter table public.twilio_phone_numbers enable row level security;

create policy "business admins read own Twilio compliance" on public.twilio_compliance_registrations
 for select to authenticated using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());
create policy "business admins read own Twilio numbers" on public.twilio_phone_numbers
 for select to authenticated using(public.has_business_role(business_id,array['owner','admin']) or public.is_servonas_platform_admin());

revoke insert,update,delete on public.twilio_compliance_registrations from anon,authenticated;
revoke insert,update,delete on public.twilio_phone_numbers from anon,authenticated;

comment on table public.twilio_compliance_registrations is 'Non-secret tenant compliance state. Provider-managed writes use the server service role.';
comment on column public.twilio_compliance_registrations.twilio_error_message_sanitized is 'Sanitized provider message only; never registration IDs, tax IDs, credentials, or raw requests.';
comment on table public.twilio_phone_numbers is 'Tenant-owned Twilio numbers. No Twilio credentials or auth tokens are stored here.';

notify pgrst, 'reload schema';
commit;
