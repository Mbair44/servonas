begin;

alter table public.jobs add column if not exists schedule_commitment text not null default 'fixed';
alter table public.jobs drop constraint if exists jobs_schedule_commitment_check;
alter table public.jobs add constraint jobs_schedule_commitment_check check(schedule_commitment in('fixed','flexible'));
create index if not exists jobs_route_schedule_commitment_idx on public.jobs(business_id,schedule_commitment,starts_at) where not is_deleted;

comment on column public.jobs.schedule_commitment is 'fixed locks the appointment time during routing; flexible permits placement anywhere on the selected service day.';

commit;
