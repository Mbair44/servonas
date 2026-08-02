begin;

create table public.business_missed_call_settings(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 enabled boolean not null default false,
 recovery_number_e164 text,
 initial_sms_body text not null default 'Sorry we missed your call. How can we help? Reply with your name and what service you need. Reply STOP to opt out.',
 ai_enabled boolean not null default true,
 ai_instructions text not null default 'Be concise, helpful, and focused on collecting the customer name, service address, issue, urgency, and preferred appointment time. Never diagnose, promise pricing, or minimize an emergency.',
 booking_enabled boolean not null default true,
 alert_phone_e164 text,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 check(recovery_number_e164 is null or recovery_number_e164=public.normalize_phone_e164(recovery_number_e164)),
 check(alert_phone_e164 is null or alert_phone_e164=public.normalize_phone_e164(alert_phone_e164)),
 check(length(initial_sms_body) between 1 and 1200),
 check(length(ai_instructions) between 1 and 4000)
);

create table public.missed_call_recovery_leads(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid,
 job_id uuid,
 provider text not null default 'twilio',
 provider_call_id text not null,
 from_phone_e164 text not null,
 to_phone_e164 text not null,
 call_status text not null,
 lead_status text not null default 'new' check(lead_status in('new','contacted','qualified','booked','lost')),
 conversation_status text not null default 'active' check(conversation_status in('active','staff_review','booked','closed','opted_out')),
 customer_name text,
 service_address text,
 issue_summary text,
 urgency text not null default 'unknown' check(urgency in('unknown','low','normal','high','emergency')),
 requested_start_at timestamptz,
 extracted_data jsonb not null default '{}'::jsonb,
 extracted_data_verified boolean not null default false,
 last_message_at timestamptz,
 alerted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(provider,provider_call_id),
 unique(business_id,id),
 foreign key(business_id,customer_id) references public.customers(business_id,id) on delete set null,
 foreign key(business_id,job_id) references public.jobs(business_id,id) on delete set null
);
create index missed_call_leads_business_status_idx on public.missed_call_recovery_leads(business_id,lead_status,created_at desc);
create index missed_call_leads_phone_active_idx on public.missed_call_recovery_leads(business_id,from_phone_e164,last_message_at desc) where conversation_status in('active','staff_review');

create table public.missed_call_recovery_messages(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 lead_id uuid not null,
 customer_id uuid,
 job_id uuid,
 direction text not null check(direction in('inbound','outbound','alert')),
 provider text not null default 'twilio',
 provider_message_id text,
 body text not null,
 ai_generated boolean not null default false,
 delivery_status text not null default 'received' check(delivery_status in('pending','received','sent','failed','suppressed')),
 error_message text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 foreign key(business_id,lead_id) references public.missed_call_recovery_leads(business_id,id) on delete cascade,
 foreign key(business_id,customer_id) references public.customers(business_id,id) on delete set null,
 foreign key(business_id,job_id) references public.jobs(business_id,id) on delete set null,
 check(length(body) between 1 and 1600)
);
create unique index missed_call_messages_provider_unique on public.missed_call_recovery_messages(provider,provider_message_id) where provider_message_id is not null;
create index missed_call_messages_lead_timeline_idx on public.missed_call_recovery_messages(business_id,lead_id,created_at);
create index missed_call_messages_customer_idx on public.missed_call_recovery_messages(business_id,customer_id,created_at desc) where customer_id is not null;
create index missed_call_messages_job_idx on public.missed_call_recovery_messages(business_id,job_id,created_at desc) where job_id is not null;

alter table public.business_missed_call_settings enable row level security;
alter table public.missed_call_recovery_leads enable row level security;
alter table public.missed_call_recovery_messages enable row level security;
create policy "members read missed call settings" on public.business_missed_call_settings for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage missed call settings" on public.business_missed_call_settings for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read missed call leads" on public.missed_call_recovery_leads for select to authenticated using(public.is_business_member(business_id));
create policy "managers update missed call leads" on public.missed_call_recovery_leads for update to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "members read missed call messages" on public.missed_call_recovery_messages for select to authenticated using(public.is_business_member(business_id));

create trigger missed_call_recovery_leads_updated_at before update on public.missed_call_recovery_leads
for each row execute function public.set_routing_updated_at();

comment on table public.missed_call_recovery_leads is 'Missed inbound calls recovered into consent-aware SMS leads linked to customers and optional booked jobs.';
comment on table public.missed_call_recovery_messages is 'Complete inbound, outbound, and escalation transcript for a missed-call recovery lead.';

notify pgrst, 'reload schema';
commit;
