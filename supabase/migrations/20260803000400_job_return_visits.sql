-- Track callbacks and return visits as structured job data.
begin;

alter table public.jobs
  add column if not exists is_return_visit boolean not null default false,
  add column if not exists return_visit_for_job_id uuid,
  add column if not exists return_visit_reason text;

alter table public.jobs
  add constraint jobs_return_visit_for_tenant_fk
  foreign key (business_id,return_visit_for_job_id)
  references public.jobs(business_id,id)
  on delete set null;

alter table public.jobs
  add constraint jobs_return_visit_consistency_check check (
    (is_return_visit and return_visit_for_job_id is distinct from id)
    or (not is_return_visit and return_visit_for_job_id is null and return_visit_reason is null)
  ),
  add constraint jobs_return_visit_reason_length_check check (
    return_visit_reason is null or length(return_visit_reason)<=1000
  );

create index jobs_business_return_visit_idx
  on public.jobs(business_id,is_return_visit,starts_at desc)
  where is_deleted=false;

comment on column public.jobs.is_return_visit is
  'True when this job is a callback or return visit for previously performed work.';

notify pgrst, 'reload schema';
commit;
