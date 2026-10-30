-- Public booking retains its minimum-notice rule. This setting applies only when
-- a staff member creates or edits a job in the workspace.
alter table public.booking_settings
  add column if not exists enforce_minimum_notice_for_staff_job_updates boolean not null default true;

comment on column public.booking_settings.enforce_minimum_notice_for_staff_job_updates is
  'Whether staff job create/edit scheduling checks enforce minimum_notice_hours. Public booking always enforces its own minimum notice.';
