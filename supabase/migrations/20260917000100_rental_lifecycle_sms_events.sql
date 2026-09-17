-- Tenant-scoped rental lifecycle SMS uses event keys to make durable triggers idempotent.
alter table public.job_communication_events
  drop constraint if exists job_communication_events_template_key_check;
alter table public.job_communication_events
  add constraint job_communication_events_template_key_check
  check (template_key in (
    'booking_confirmation', 'booking_pending', 'booking_cancelled', 'reminder', 'review_request',
    'manager_new_booking', 'job_booked', 'job_confirmed', 'technician_assigned', 'technician_en_route',
    'job_rescheduled', 'job_cancelled', 'job_completed', 'scheduled_arrival_window', 'route_en_route',
    'route_proximity_eta', 'payment_receipt'
  ));
create unique index if not exists job_communication_events_rental_lifecycle_sms_dedupe
  on public.job_communication_events(job_id, channel, template_key, event_key)
  where channel = 'sms'
    and event_key is not null
    and template_key in ('reminder', 'technician_en_route', 'review_request', 'payment_receipt');
