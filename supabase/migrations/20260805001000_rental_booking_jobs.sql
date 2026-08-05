alter table public.bookings add column if not exists job_id uuid references public.jobs(id) on delete set null;
create unique index if not exists bookings_job_id_unique on public.bookings(job_id) where job_id is not null;
create index if not exists bookings_business_job_idx on public.bookings(business_id,job_id);
