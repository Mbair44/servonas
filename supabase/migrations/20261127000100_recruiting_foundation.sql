-- Recruiting MVP foundation. Applicant records are intentionally isolated from CRM and workforce tables.

create table if not exists public.business_recruiting_settings(
  business_id uuid primary key references public.businesses(id) on delete cascade,
  careers_enabled boolean not null default false,
  show_careers_nav_link boolean not null default false,
  show_careers_footer_link boolean not null default false,
  notification_email text,
  applicant_retention_days integer not null default 365 check(applicant_retention_days between 30 and 3650),
  privacy_notice_version text not null default 'recruiting-privacy-v1' check(char_length(privacy_notice_version) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  check(notification_email is null or notification_email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')
);

create table if not exists public.job_postings(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  slug text not null check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 120),
  title text not null check(char_length(btrim(title)) between 1 and 180),
  location text not null check(char_length(btrim(location)) between 1 and 240),
  employment_type text not null check(employment_type in('full_time','part_time','seasonal','temporary','contract','other')),
  compensation_text text,
  description text not null check(char_length(btrim(description)) between 1 and 30000),
  qualifications text not null default '' check(char_length(qualifications) <= 30000),
  status text not null default 'draft' check(status in('draft','published','closed')),
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique(business_id,id),
  unique(business_id,slug),
  check((status <> 'published') or published_at is not null),
  check((status <> 'closed') or closed_at is not null)
);

create table if not exists public.job_applications(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_posting_id uuid not null,
  first_name text not null check(char_length(btrim(first_name)) between 1 and 100),
  last_name text not null check(char_length(btrim(last_name)) between 1 and 100),
  email text not null check(char_length(email) <= 320 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'),
  phone text not null check(char_length(btrim(phone)) between 3 and 40),
  city text not null check(char_length(btrim(city)) between 1 and 160),
  availability text not null check(char_length(btrim(availability)) between 1 and 4000),
  weekend_availability boolean not null,
  drivers_license_confirmed boolean not null,
  relevant_experience text not null check(char_length(btrim(relevant_experience)) between 1 and 12000),
  interest_statement text not null check(char_length(btrim(interest_statement)) between 1 and 12000),
  privacy_acknowledged_at timestamptz not null,
  privacy_notice_version text not null check(char_length(privacy_notice_version) between 1 and 120),
  resume_storage_path text,
  resume_original_name text,
  resume_content_type text,
  resume_size_bytes bigint,
  status text not null default 'new' check(status in('new','under_review','interview','offer_extended','hired','rejected','withdrawn')),
  status_updated_at timestamptz not null default now(),
  status_updated_by uuid references auth.users(id),
  submission_key uuid,
  submitted_ip_hash text check(submitted_ip_hash is null or submitted_ip_hash ~ '^[a-f0-9]{64}$'),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,id),
  unique(business_id,submission_key),
  foreign key(business_id,job_posting_id) references public.job_postings(business_id,id) on delete restrict,
  check((resume_storage_path is null and resume_original_name is null and resume_content_type is null and resume_size_bytes is null) or
        (resume_storage_path is not null and resume_original_name is not null and resume_content_type in('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') and resume_size_bytes between 1 and 5242880)),
  check(resume_storage_path is null or resume_storage_path like business_id::text || '/' || id::text || '/%')
);

create table if not exists public.job_application_notes(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  application_id uuid not null,
  body text not null check(char_length(btrim(body)) between 1 and 12000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(business_id,application_id) references public.job_applications(business_id,id) on delete cascade
);

create table if not exists public.job_application_status_history(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  application_id uuid not null,
  previous_status text check(previous_status is null or previous_status in('new','under_review','interview','offer_extended','hired','rejected','withdrawn')),
  status text not null check(status in('new','under_review','interview','offer_extended','hired','rejected','withdrawn')),
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  foreign key(business_id,application_id) references public.job_applications(business_id,id) on delete cascade
);

create index if not exists job_postings_business_status_idx on public.job_postings(business_id,status,published_at desc);
create index if not exists job_applications_business_status_idx on public.job_applications(business_id,status,created_at desc);
create index if not exists job_applications_position_idx on public.job_applications(business_id,job_posting_id,created_at desc);
create index if not exists job_application_notes_application_idx on public.job_application_notes(business_id,application_id,created_at desc);
create index if not exists job_application_status_history_application_idx on public.job_application_status_history(business_id,application_id,changed_at desc);

create or replace function public.recruiting_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at=now();
  if tg_table_name='job_applications' and new.status is distinct from old.status then
    new.status_updated_at=now();
    if auth.uid() is not null then new.status_updated_by=auth.uid(); end if;
  end if;
  return new;
end;
$$;

create or replace function public.record_job_application_status_history()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    insert into public.job_application_status_history(business_id,application_id,previous_status,status,changed_by)
    values(new.business_id,new.id,null,new.status,coalesce(auth.uid(),new.status_updated_by));
  elsif new.status is distinct from old.status then
    insert into public.job_application_status_history(business_id,application_id,previous_status,status,changed_by)
    values(new.business_id,new.id,old.status,new.status,coalesce(auth.uid(),new.status_updated_by));
  end if;
  return new;
end;
$$;

drop trigger if exists business_recruiting_settings_updated_at on public.business_recruiting_settings;
create trigger business_recruiting_settings_updated_at before update on public.business_recruiting_settings for each row execute function public.recruiting_set_updated_at();
drop trigger if exists job_postings_updated_at on public.job_postings;
create trigger job_postings_updated_at before update on public.job_postings for each row execute function public.recruiting_set_updated_at();
drop trigger if exists job_applications_updated_at on public.job_applications;
create trigger job_applications_updated_at before update on public.job_applications for each row execute function public.recruiting_set_updated_at();
drop trigger if exists job_applications_status_history on public.job_applications;
create trigger job_applications_status_history after insert or update of status on public.job_applications for each row execute function public.record_job_application_status_history();

insert into public.business_recruiting_settings(business_id)
select id from public.businesses
on conflict(business_id) do nothing;

create or replace function public.create_default_business_recruiting_settings()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.business_recruiting_settings(business_id) values(new.id) on conflict(business_id) do nothing;
  return new;
end;
$$;
drop trigger if exists businesses_create_recruiting_settings on public.businesses;
create trigger businesses_create_recruiting_settings after insert on public.businesses for each row execute function public.create_default_business_recruiting_settings();

alter table public.business_recruiting_settings enable row level security;
alter table public.job_postings enable row level security;
alter table public.job_applications enable row level security;
alter table public.job_application_notes enable row level security;
alter table public.job_application_status_history enable row level security;

do $$ declare t text; begin
  foreach t in array array['business_recruiting_settings','job_postings','job_applications'] loop
    execute format('drop policy if exists "recruiting owners admins manage %1$s" on public.%1$I',t);
    execute format('create policy "recruiting owners admins manage %1$s" on public.%1$I for all to authenticated using(public.has_business_role(business_id,array[''owner'',''admin''])) with check(public.has_business_role(business_id,array[''owner'',''admin'']))',t);
  end loop;
end $$;

create policy "recruiting owners admins read notes" on public.job_application_notes for select to authenticated using(public.has_business_role(business_id,array['owner','admin']));
create policy "recruiting owners admins add notes" on public.job_application_notes for insert to authenticated with check(public.has_business_role(business_id,array['owner','admin']));
create policy "recruiting owners admins read status history" on public.job_application_status_history for select to authenticated using(public.has_business_role(business_id,array['owner','admin']));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('application-resumes','application-resumes',false,5242880,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "recruiting owners admins read resumes" on storage.objects;
create policy "recruiting owners admins read resumes" on storage.objects for select to authenticated using(
  bucket_id='application-resumes' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin'])
);
drop policy if exists "recruiting owners admins upload resumes" on storage.objects;
create policy "recruiting owners admins upload resumes" on storage.objects for insert to authenticated with check(
  bucket_id='application-resumes' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin'])
);
drop policy if exists "recruiting owners admins delete resumes" on storage.objects;
create policy "recruiting owners admins delete resumes" on storage.objects for delete to authenticated using(
  bucket_id='application-resumes' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin'])
);

comment on table public.business_recruiting_settings is 'Tenant-scoped careers controls. Careers are disabled by default.';
comment on table public.job_postings is 'Tenant-scoped recruiting positions, separate from service jobs.';
comment on table public.job_applications is 'Applicant records. Never join to customers or employees.';
comment on table public.job_application_status_history is 'Append-only application status audit history written by database trigger.';
comment on column public.job_applications.resume_storage_path is 'Private application-resumes storage path; never a public URL.';
