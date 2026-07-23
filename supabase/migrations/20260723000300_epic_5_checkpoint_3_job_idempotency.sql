-- Epic 5 Checkpoint 3: office-created job idempotency.
alter table public.jobs add column if not exists request_key uuid;
create unique index if not exists jobs_business_request_key_unique
  on public.jobs(business_id,request_key)
  where request_key is not null;

-- Office and future technician photo metadata. Binary objects remain private
-- in Storage and are displayed through short-lived signed URLs.
create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null,
  storage_path text not null unique,
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint job_photos_job_tenant_fk foreign key (business_id,job_id)
    references public.jobs(business_id,id) on delete cascade
);
create index if not exists job_photos_job_created_idx
  on public.job_photos(business_id,job_id,created_at desc);
alter table public.job_photos enable row level security;

create policy "members can view job photos" on public.job_photos
  for select to authenticated using (public.is_business_member(business_id));
create policy "managers can add job photos" on public.job_photos
  for insert to authenticated with check (
    public.has_business_role(business_id,array['owner','admin','manager'])
    and uploaded_by=auth.uid()
  );
create policy "managers can remove job photos" on public.job_photos
  for delete to authenticated using (
    public.has_business_role(business_id,array['owner','admin','manager'])
  );

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('job-photos','job-photos',false,10485760,array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy "members can read job photo objects" on storage.objects
  for select to authenticated using (
    bucket_id='job-photos'
    and public.is_business_member(((storage.foldername(name))[1])::uuid)
  );
create policy "managers can upload job photo objects" on storage.objects
  for insert to authenticated with check (
    bucket_id='job-photos'
    and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager'])
  );
create policy "managers can remove job photo objects" on storage.objects
  for delete to authenticated using (
    bucket_id='job-photos'
    and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager'])
  );
