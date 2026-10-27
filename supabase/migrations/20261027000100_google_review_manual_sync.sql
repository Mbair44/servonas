begin;

alter table public.google_review_sync_runs
 add column if not exists records_inserted integer not null default 0,
 add column if not exists records_updated integer not null default 0;

-- One active run per tenant prevents simultaneous manual and scheduled syncs.
create unique index if not exists google_review_sync_runs_one_active_per_business_idx
 on public.google_review_sync_runs(business_id) where status='started';

create index if not exists google_review_sync_runs_business_completed_idx
 on public.google_review_sync_runs(business_id,completed_at desc);

notify pgrst,'reload schema';
commit;
