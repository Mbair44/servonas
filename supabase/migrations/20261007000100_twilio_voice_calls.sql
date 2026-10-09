begin;

-- bookings.id is globally unique, but the tenant-scoped foreign key below
-- intentionally also verifies business_id. PostgreSQL requires the exact
-- referenced column pair to be backed by a unique index.
create unique index if not exists bookings_business_id_id_unique on public.bookings(business_id,id);

create table if not exists public.business_voice_settings(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 enabled boolean not null default false,
 routing_mode text not null default 'ring_all' check(routing_mode in('ring_all','on_call')),
 on_call_employee_id uuid,
 fallback_employee_id uuid,
 ring_timeout_seconds integer not null default 20 check(ring_timeout_seconds between 10 and 30),
 missed_call_sms_enabled boolean not null default true,
 missed_call_sms_body text not null default 'Hi! Sorry we missed your call — this is {{business_name}}. How can we help?',
 recording_mode text not null default 'off' check(recording_mode in('off','incoming','outgoing','all')),
 voicemail_enabled boolean not null default false,
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id) on delete set null,
 foreign key(business_id,on_call_employee_id) references public.employees(business_id,id) on delete set null,
 foreign key(business_id,fallback_employee_id) references public.employees(business_id,id) on delete set null,
 check(length(missed_call_sms_body) between 1 and 1200)
);

create table if not exists public.voice_call_staff(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 employee_id uuid not null,phone_e164 text not null,enabled boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,employee_id),foreign key(business_id,employee_id) references public.employees(business_id,id) on delete cascade,
 check(phone_e164=public.normalize_phone_e164(phone_e164))
);

create table if not exists public.voice_calls(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid,booking_id uuid,job_id uuid,twilio_call_sid text not null,twilio_parent_call_sid text,
 direction text not null check(direction in('inbound','outbound')),
 status text not null default 'initiated' check(status in('initiated','ringing','in_progress','completed','busy','no_answer','failed','canceled')),
 from_number text not null,to_number text not null,routing_mode text,answered_by_employee_id uuid,
 started_at timestamptz not null default now(),ringing_at timestamptz,answered_at timestamptz,ended_at timestamptz,duration_seconds integer,
 was_missed boolean not null default false,missed_call_sms_sent_at timestamptz,
 recording_status text,recording_sid text,recording_duration_seconds integer,transcription_status text not null default 'not_requested',
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(twilio_call_sid),foreign key(business_id,customer_id) references public.customers(business_id,id) on delete set null,
 foreign key(business_id,booking_id) references public.bookings(business_id,id) on delete set null,
 foreign key(business_id,job_id) references public.jobs(business_id,id) on delete set null,
 foreign key(business_id,answered_by_employee_id) references public.employees(business_id,id) on delete set null
);
create table if not exists public.voice_call_legs(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,call_id uuid not null references public.voice_calls(id) on delete cascade,
 twilio_call_sid text not null,employee_id uuid,phone_e164 text not null,status text not null default 'initiated',answered_at timestamptz,ended_at timestamptz,duration_seconds integer,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(twilio_call_sid),foreign key(business_id,employee_id) references public.employees(business_id,id) on delete set null
);
create index if not exists voice_calls_business_started_idx on public.voice_calls(business_id,started_at desc);
create index if not exists voice_calls_customer_idx on public.voice_calls(business_id,customer_id,started_at desc) where customer_id is not null;
create index if not exists voice_call_legs_call_idx on public.voice_call_legs(call_id,created_at);

alter table public.business_voice_settings enable row level security;
alter table public.voice_call_staff enable row level security;
alter table public.voice_calls enable row level security;
alter table public.voice_call_legs enable row level security;
create policy "members read voice settings" on public.business_voice_settings for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage voice settings" on public.business_voice_settings for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read voice staff" on public.voice_call_staff for select to authenticated using(public.is_business_member(business_id));
create policy "admins manage voice staff" on public.voice_call_staff for all to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));
create policy "members read voice calls" on public.voice_calls for select to authenticated using(public.is_business_member(business_id));
create policy "members read voice call legs" on public.voice_call_legs for select to authenticated using(public.is_business_member(business_id));
revoke insert,update,delete on public.voice_calls,public.voice_call_legs from anon,authenticated;
notify pgrst,'reload schema';
commit;
