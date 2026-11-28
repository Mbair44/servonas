-- The original shared timestamp trigger also referenced NEW.status. PostgreSQL
-- binds record fields for the trigger relation, so updates to recruiting
-- settings failed because that table deliberately has no status column.

create or replace function public.recruiting_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

create or replace function public.recruiting_set_application_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at=now();
  if new.status is distinct from old.status then
    new.status_updated_at=now();
    if auth.uid() is not null then
      new.status_updated_by=auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists job_applications_updated_at on public.job_applications;
create trigger job_applications_updated_at
before update on public.job_applications
for each row execute function public.recruiting_set_application_updated_at();

comment on function public.recruiting_set_updated_at() is
  'Sets updated_at on recruiting settings and job postings without assuming a status column.';
comment on function public.recruiting_set_application_updated_at() is
  'Sets updated_at and audits application status update metadata.';
