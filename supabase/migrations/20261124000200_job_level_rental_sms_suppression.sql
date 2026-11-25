begin;

alter table public.jobs
  add column if not exists suppress_rental_reminder_sms boolean not null default false,
  add column if not exists suppress_technician_en_route_sms boolean not null default false;

comment on column public.jobs.suppress_rental_reminder_sms is
  'When true, do not send this job the party-rental day-before reminder SMS.';
comment on column public.jobs.suppress_technician_en_route_sms is
  'When true, do not send this job the party-rental technician-en-route SMS.';

commit;
