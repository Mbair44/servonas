-- Epic 5 Checkpoint 11: allow field-service notification lifecycle stubs.
alter table public.job_communication_events
  drop constraint if exists job_communication_events_template_key_check;

alter table public.job_communication_events
  add constraint job_communication_events_template_key_check
  check (template_key in (
    'booking_confirmation', 'booking_pending', 'booking_cancelled',
    'reminder', 'review_request', 'manager_new_booking',
    'job_booked', 'job_confirmed', 'technician_assigned',
    'appointment_reminder', 'technician_en_route', 'job_rescheduled',
    'job_cancelled', 'job_completed'
  ));
