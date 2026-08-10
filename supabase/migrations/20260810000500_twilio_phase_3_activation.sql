begin;

create table if not exists public.twilio_tenant_activations(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null unique references public.businesses(id) on delete cascade,
 business_twilio_account_id uuid not null unique references public.business_twilio_accounts(id) on delete cascade,
 status text not null default 'not_started',
 current_step text not null default 'readiness',
 messaging_service_sid text,
 brand_registration_sid text,
 campaign_sid text,
 phone_number_sid text,
 legacy_sms_preserved boolean not null default true,
 outbound_sender_mode text not null default 'legacy',
 last_error_category text,
 activated_at timestamptz,
 last_synced_at timestamptz,
 version bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint twilio_activation_status_check check(status in('not_started','blocked','in_progress','pending_profile','pending_brand','pending_campaign','ready','active','failed','suspended')),
 constraint twilio_activation_step_check check(current_step in('readiness','secondary_profile','brand','messaging_service','campaign','phone_association','activation','complete')),
 constraint twilio_activation_sender_check check(outbound_sender_mode in('legacy','messaging_service')),
 constraint twilio_activation_messaging_sid_check check(messaging_service_sid is null or messaging_service_sid ~ '^MG[0-9A-Za-z]{32}$'),
 constraint twilio_activation_brand_sid_check check(brand_registration_sid is null or brand_registration_sid ~ '^BN[0-9A-Za-z]{32}$'),
 constraint twilio_activation_campaign_sid_check check(campaign_sid is null or campaign_sid ~ '^QE[0-9A-Za-z]{32}$'),
 constraint twilio_activation_phone_sid_check check(phone_number_sid is null or phone_number_sid ~ '^PN[0-9A-Za-z]{32}$')
);

create table if not exists public.twilio_tenant_activation_events(
 id bigint generated always as identity primary key,
 activation_id uuid not null references public.twilio_tenant_activations(id) on delete cascade,
 business_id uuid not null references public.businesses(id) on delete cascade,
 event_type text not null,
 from_status text,
 to_status text not null,
 step text not null,
 actor_user_id uuid references auth.users(id) on delete set null,
 metadata jsonb not null default '{}'::jsonb,
 occurred_at timestamptz not null default now()
);

create index if not exists twilio_activation_business_status_idx on public.twilio_tenant_activations(business_id,status);
create index if not exists twilio_activation_events_timeline_idx on public.twilio_tenant_activation_events(business_id,occurred_at desc);
alter table public.twilio_tenant_activations enable row level security;
alter table public.twilio_tenant_activation_events enable row level security;
create policy "platform admins read Twilio activations" on public.twilio_tenant_activations for select to authenticated using(public.is_servonas_platform_admin());
create policy "platform admins read Twilio activation events" on public.twilio_tenant_activation_events for select to authenticated using(public.is_servonas_platform_admin());
revoke insert,update,delete on public.twilio_tenant_activations from anon,authenticated;
revoke insert,update,delete on public.twilio_tenant_activation_events from anon,authenticated;
comment on table public.twilio_tenant_activations is 'Non-secret Phase 3 A2P and Messaging Service activation state. Provider credentials and registration identifiers are never stored here.';
notify pgrst, 'reload schema';
commit;
