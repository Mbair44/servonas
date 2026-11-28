-- Public submissions use the service role, so enforce Careers visibility and job status again in PostgreSQL.
create or replace function public.guard_job_application_submission()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_careers boolean;v_status text;
begin
 select careers_enabled into v_careers from public.business_recruiting_settings where business_id=new.business_id for key share;
 if v_careers is distinct from true then raise exception 'CAREERS_DISABLED' using errcode='42501'; end if;
 select status into v_status from public.job_postings where id=new.job_posting_id and business_id=new.business_id for key share;
 if v_status is distinct from 'published' then raise exception 'JOB_NOT_PUBLISHED' using errcode='42501'; end if;
 return new;
end;
$$;
drop trigger if exists job_applications_guard_submission on public.job_applications;
create trigger job_applications_guard_submission before insert on public.job_applications for each row execute function public.guard_job_application_submission();

create table if not exists public.recruiting_email_deliveries(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,application_id uuid not null,delivery_type text not null check(delivery_type in('applicant_confirmation','business_notification')),recipient text not null,status text not null default 'pending' check(status in('pending','sent','failed')),provider_message_id text,error_message text,attempt_count integer not null default 0,created_at timestamptz not null default now(),sent_at timestamptz,updated_at timestamptz not null default now(),unique(application_id,delivery_type),foreign key(business_id,application_id) references public.job_applications(business_id,id) on delete cascade
);
alter table public.recruiting_email_deliveries enable row level security;
create policy "recruiting owners admins read email deliveries" on public.recruiting_email_deliveries for select to authenticated using(public.has_business_role(business_id,array['owner','admin']));
