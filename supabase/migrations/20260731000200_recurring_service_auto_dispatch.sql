-- Opt-in day-of dispatch for assigned recurring service jobs.
begin;

alter table public.recurring_service_series
  add column if not exists auto_dispatch boolean not null default false;

comment on column public.recurring_service_series.auto_dispatch is
  'When enabled, assigned generated jobs move from scheduled/confirmed to dispatched on the business-local appointment date.';

create or replace function public.dispatch_due_recurring_jobs()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  update public.jobs j
  set status='dispatched',updated_at=now()
  from public.recurring_service_series p
  join public.businesses b on b.id=p.business_id and b.is_deleted=false
  where j.business_id=p.business_id
    and j.recurring_service_series_id=p.id
    and j.is_deleted=false
    and p.status='active'
    and p.is_active=true
    and p.auto_dispatch=true
    and j.assigned_technician_id is not null
    and j.status in ('scheduled','confirmed')
    and j.starts_at is not null
    and (j.starts_at at time zone coalesce(b.timezone,'America/Phoenix'))::date
        =(now() at time zone coalesce(b.timezone,'America/Phoenix'))::date;

  get diagnostics v_count=row_count;
  return v_count;
end
$$;

revoke all on function public.dispatch_due_recurring_jobs() from public,anon,authenticated;
grant execute on function public.dispatch_due_recurring_jobs() to service_role;

notify pgrst, 'reload schema';
commit;
