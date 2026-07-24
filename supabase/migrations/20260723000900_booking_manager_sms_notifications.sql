-- Optional operational SMS alert for newly completed public bookings.
alter table public.booking_settings
  add column if not exists booking_manager_phone text;

alter table public.job_communication_events
  add column if not exists recipient_phone text,
  add column if not exists message_body text;

alter table public.job_communication_events
  drop constraint if exists job_communication_events_template_key_check;
alter table public.job_communication_events
  add constraint job_communication_events_template_key_check
  check (template_key in (
    'booking_confirmation',
    'booking_pending',
    'booking_cancelled',
    'reminder',
    'review_request',
    'manager_new_booking'
  ));

-- A retry of the booking action must not generate a second manager alert.
create unique index if not exists job_communication_events_manager_booking_unique
  on public.job_communication_events(job_id,template_key)
  where template_key='manager_new_booking';
