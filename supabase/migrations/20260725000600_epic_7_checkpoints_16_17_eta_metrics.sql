-- Epic 7, Checkpoints 16-17: ETA notification readiness and route reporting.
-- This migration does not send messages and does not represent provider route
-- estimates as GPS-derived or odometer-measured values.
begin;

alter table public.business_routing_policies
  add column if not exists scheduled_window_notifications_enabled boolean not null default false,
  add column if not exists en_route_notifications_enabled boolean not null default false,
  add column if not exists proximity_eta_notifications_enabled boolean not null default false;

alter table public.job_communication_events
  add column if not exists route_plan_id uuid,
  add column if not exists route_stop_id uuid,
  add column if not exists recipient_phone text,
  add column if not exists event_key text,
  add column if not exists delivery_context jsonb not null default '{}'::jsonb;

alter table public.job_communication_events
  drop constraint if exists job_communication_events_template_key_check;
alter table public.job_communication_events
  add constraint job_communication_events_template_key_check
  check (template_key in (
    'booking_confirmation', 'booking_pending', 'booking_cancelled',
    'reminder', 'review_request', 'manager_new_booking',
    'job_booked', 'job_confirmed', 'technician_assigned',
    'appointment_reminder', 'technician_en_route', 'job_rescheduled',
    'job_cancelled', 'job_completed',
    'scheduled_arrival_window', 'route_en_route', 'route_proximity_eta'
  ));

alter table public.job_communication_events
  drop constraint if exists job_communication_events_route_plan_fk;
alter table public.job_communication_events
  add constraint job_communication_events_route_plan_fk
  foreign key (route_plan_id) references public.route_plans(id) on delete set null;

alter table public.job_communication_events
  drop constraint if exists job_communication_events_route_stop_fk;
alter table public.job_communication_events
  add constraint job_communication_events_route_stop_fk
  foreign key (route_stop_id) references public.route_stops(id) on delete set null;

alter table public.job_communication_events
  drop constraint if exists job_communication_events_delivery_context_object_check;
alter table public.job_communication_events
  add constraint job_communication_events_delivery_context_object_check
  check (jsonb_typeof(delivery_context)='object');

create unique index if not exists job_communication_events_route_event_dedupe
  on public.job_communication_events(job_id,channel,template_key,event_key)
  where event_key is not null
    and template_key in ('scheduled_arrival_window','route_en_route','route_proximity_eta');

create index if not exists job_communication_events_route_plan_idx
  on public.job_communication_events(route_plan_id,created_at desc)
  where route_plan_id is not null;

comment on column public.job_communication_events.event_key is
  'Caller-supplied idempotency key. Route notifications use plan revision and event type to prevent duplicate delivery.';
comment on column public.job_communication_events.delivery_context is
  'Non-sensitive normalized delivery context and confidence evidence; never provider credentials or live-location history.';
comment on column public.business_routing_policies.proximity_eta_notifications_enabled is
  'Opt-in readiness flag. Enabling this alone is insufficient: current route state, prior-stop completion, provider drive time, and confidence are also required.';

commit;
