-- Business-wide day-of auto dispatch for assigned recurring and one-time jobs.
begin;

alter table public.business_routing_policies
  add column if not exists auto_dispatch_all_jobs boolean not null default false;

comment on column public.business_routing_policies.auto_dispatch_all_jobs is
  'When enabled, every assigned scheduled or confirmed job is dispatched on its business-local appointment day. Per-plan recurring auto dispatch remains available when disabled.';

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
  from public.businesses b
  where j.business_id=b.id
    and b.is_deleted=false
    and j.is_deleted=false
    and j.assigned_technician_id is not null
    and j.status in ('scheduled','confirmed')
    and j.starts_at is not null
    and (j.starts_at at time zone coalesce(b.timezone,'America/Phoenix'))::date
        =(now() at time zone coalesce(b.timezone,'America/Phoenix'))::date
    and (
      coalesce((
        select policy.auto_dispatch_all_jobs
        from public.business_routing_policies policy
        where policy.business_id=j.business_id
      ),false)
      or exists (
        select 1
        from public.recurring_service_series plan
        where plan.business_id=j.business_id
          and plan.id=j.recurring_service_series_id
          and plan.status='active'
          and plan.is_active=true
          and plan.auto_dispatch=true
      )
    );

  get diagnostics v_count=row_count;
  return v_count;
end
$$;

revoke all on function public.dispatch_due_recurring_jobs() from public,anon,authenticated;
grant execute on function public.dispatch_due_recurring_jobs() to service_role;

notify pgrst, 'reload schema';
commit;
