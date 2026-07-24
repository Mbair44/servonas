-- Move the Epic 4.5 communication-event foundation into the executable
-- migration sequence before migrations 009, 010, and 013 depend on it.
create table if not exists public.job_communication_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  channel text not null
    constraint job_communication_events_channel_check
    check (channel in ('email','sms')),
  template_key text not null
    constraint job_communication_events_template_key_check
    check (template_key in (
      'booking_confirmation',
      'booking_pending',
      'booking_cancelled',
      'reminder',
      'review_request'
    )),
  status text not null default 'stubbed'
    constraint job_communication_events_status_check
    check (status in ('stubbed','queued','sent','failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists job_communication_events_job_idx
  on public.job_communication_events(job_id,created_at desc);

alter table public.job_communication_events enable row level security;

drop policy if exists "members view job communications"
  on public.job_communication_events;
create policy "members view job communications"
  on public.job_communication_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs
      where jobs.id=job_communication_events.job_id
        and public.is_business_member(jobs.business_id)
    )
  );
