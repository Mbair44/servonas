-- Customer-facing booking delivery metadata and SMS consent.
alter table public.public_booking_submissions
  add column if not exists sms_consent boolean not null default false;

alter table public.job_communication_events
  add column if not exists recipient_email text;

create unique index if not exists job_communication_events_customer_confirmation_unique
  on public.job_communication_events(job_id,channel,template_key)
  where template_key in ('booking_confirmation','booking_pending');
