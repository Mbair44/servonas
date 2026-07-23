-- Epic 4.5 production booking: analytics and provider-neutral communication stubs.
-- This unique partial index is the server action's idempotency boundary. It is
-- repeated here so this migration is safe to apply even if environments were
-- provisioned from an older Epic 4.5 schema.
create unique index if not exists public_booking_request_key_unique
  on public.public_booking_submissions(business_id,request_key)
  where request_key is not null;

create table if not exists public.public_booking_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  submission_id uuid references public.public_booking_submissions(id) on delete set null,
  event_name text not null check (event_name in (
    'page_viewed','calendar_viewed','time_selected','booking_submitted','booking_completed'
  )),
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists public_booking_events_reporting_idx
  on public.public_booking_events(business_id,event_name,occurred_at desc);
alter table public.public_booking_events enable row level security;
drop policy if exists "members view booking analytics" on public.public_booking_events;
create policy "members view booking analytics" on public.public_booking_events
  for select to authenticated using (public.is_business_member(business_id));

create table if not exists public.job_communication_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  channel text not null check (channel in ('email','sms')),
  template_key text not null check (template_key in (
    'booking_confirmation','booking_pending','booking_cancelled','reminder','review_request'
  )),
  status text not null default 'stubbed' check (status in ('stubbed','queued','sent','failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists job_communication_events_job_idx
  on public.job_communication_events(job_id,created_at desc);
alter table public.job_communication_events enable row level security;
drop policy if exists "members view job communications" on public.job_communication_events;
create policy "members view job communications" on public.job_communication_events
  for select to authenticated using (
    exists (
      select 1 from public.jobs
      where jobs.id=job_communication_events.job_id
        and public.is_business_member(jobs.business_id)
    )
  );
