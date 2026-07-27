-- Epic 2.2 Checkpoint 3: private, resumable employee import uploads.
create table if not exists public.employee_imports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  import_type text not null default 'employee' check (import_type='employee'),
  file_name text not null,
  file_extension text not null check (file_extension in ('csv','xlsx')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  file_checksum text not null,
  storage_path text,
  status text not null default 'uploaded' check (status in ('uploaded','failed','canceled')),
  current_stage text not null default 'mapping' check (current_stage in ('upload','mapping')),
  source_columns jsonb not null default '[]' check (jsonb_typeof(source_columns)='array'),
  total_row_count integer not null check (total_row_count between 0 and 2000),
  uploaded_by uuid not null references auth.users(id),
  request_key uuid not null,
  error_category text,
  raw_data_expires_at timestamptz not null default (now()+interval '30 days'),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,id),
  unique (business_id,request_key)
);
alter table public.employee_imports enable row level security;
drop policy if exists "admins read employee imports" on public.employee_imports;
create policy "admins read employee imports" on public.employee_imports for select to authenticated
using (public.has_business_role(business_id,array['owner','admin']));
drop policy if exists "admins create employee imports" on public.employee_imports;
create policy "admins create employee imports" on public.employee_imports for insert to authenticated
with check (uploaded_by=auth.uid() and public.has_business_role(business_id,array['owner','admin']));
drop policy if exists "admins update employee imports" on public.employee_imports;
create policy "admins update employee imports" on public.employee_imports for update to authenticated
using (public.has_business_role(business_id,array['owner','admin']))
with check (public.has_business_role(business_id,array['owner','admin']));
create index if not exists employee_imports_business_activity_idx on public.employee_imports(business_id,last_activity_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('employee-imports','employee-imports',false,10485760,array[
  'text/csv','application/csv','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "admins read employee import files" on storage.objects;
create policy "admins read employee import files" on storage.objects for select to authenticated using (
  bucket_id='employee-imports' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin'])
);
drop policy if exists "admins upload employee import files" on storage.objects;
create policy "admins upload employee import files" on storage.objects for insert to authenticated with check (
  bucket_id='employee-imports' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin'])
);
drop policy if exists "admins delete employee import files" on storage.objects;
create policy "admins delete employee import files" on storage.objects for delete to authenticated using (
  bucket_id='employee-imports' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin'])
);
comment on table public.employee_imports is 'Tenant-scoped employee import sessions. Raw source files are private and expire after 30 days.';
