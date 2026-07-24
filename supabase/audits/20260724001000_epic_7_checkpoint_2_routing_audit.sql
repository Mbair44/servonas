-- Epic 7 Checkpoint 2 post-migration integrity audit.
--
-- Run in the Supabase SQL editor after applying:
--   supabase/migrations/20260724001000_epic_7_checkpoint_2_routing_foundation.sql
--
-- Every result should return zero. This migration adds no NOT VALID foreign
-- keys because every routing table is new and empty at creation; all composite
-- foreign keys are validated immediately. These queries document and verify
-- tenant isolation after future imports/backfills.

select 'route_plan_business_orphans' as audit, count(*) as failing_rows
from public.route_plans rp
left join public.businesses b on b.id=rp.business_id
where b.id is null
union all
select 'technician_route_plan_tenant_mismatches',count(*)
from public.technician_routes tr
left join public.route_plans rp
  on rp.business_id=tr.business_id and rp.id=tr.route_plan_id
where rp.id is null
union all
select 'technician_route_technician_tenant_mismatches',count(*)
from public.technician_routes tr
left join public.technician_profiles tp
  on tp.business_id=tr.business_id and tp.id=tr.technician_id
where tp.id is null
union all
select 'route_stop_route_tenant_mismatches',count(*)
from public.route_stops rs
left join public.technician_routes tr
  on tr.business_id=rs.business_id
 and tr.route_plan_id=rs.route_plan_id
 and tr.id=rs.technician_route_id
where tr.id is null
union all
select 'route_stop_job_tenant_mismatches',count(*)
from public.route_stops rs
left join public.jobs j on j.business_id=rs.business_id and j.id=rs.job_id
where j.id is null
union all
select 'route_stop_location_tenant_mismatches',count(*)
from public.route_stops rs
left join public.service_locations sl
  on sl.business_id=rs.business_id and sl.id=rs.service_location_id
where rs.service_location_id is not null and sl.id is null
union all
select 'route_leg_route_tenant_mismatches',count(*)
from public.route_legs rl
left join public.technician_routes tr
  on tr.business_id=rl.business_id and tr.id=rl.technician_route_id
where tr.id is null
union all
select 'route_leg_from_stop_tenant_mismatches',count(*)
from public.route_legs rl
left join public.route_stops rs
  on rs.business_id=rl.business_id
 and rs.technician_route_id=rl.technician_route_id
 and rs.id=rl.from_route_stop_id
where rl.from_route_stop_id is not null and rs.id is null
union all
select 'route_leg_to_stop_tenant_mismatches',count(*)
from public.route_legs rl
left join public.route_stops rs
  on rs.business_id=rl.business_id
 and rs.technician_route_id=rl.technician_route_id
 and rs.id=rl.to_route_stop_id
where rl.to_route_stop_id is not null and rs.id is null
union all
select 'optimization_run_plan_tenant_mismatches',count(*)
from public.route_optimization_runs ro
left join public.route_plans rp
  on rp.business_id=ro.business_id and rp.id=ro.route_plan_id
where rp.id is null
union all
select 'suggestion_plan_tenant_mismatches',count(*)
from public.route_suggestions rs
left join public.route_plans rp
  on rp.business_id=rs.business_id and rp.id=rs.route_plan_id
where rp.id is null
union all
select 'suggestion_run_tenant_mismatches',count(*)
from public.route_suggestions rs
left join public.route_optimization_runs ro
  on ro.business_id=rs.business_id
 and ro.route_plan_id=rs.route_plan_id
 and ro.id=rs.optimization_run_id
where ro.id is null;

-- RLS must be enabled and forced access must be provided by explicit policies.
select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'route_plans','technician_routes','route_stops','route_legs',
    'route_optimization_runs','route_suggestions'
  )
order by c.relname;

-- Confirm every routing foreign key is validated.
select conrelid::regclass as table_name,conname,convalidated
from pg_constraint
where contype='f'
  and conrelid in (
    'public.route_plans'::regclass,
    'public.technician_routes'::regclass,
    'public.route_stops'::regclass,
    'public.route_legs'::regclass,
    'public.route_optimization_runs'::regclass,
    'public.route_suggestions'::regclass
  )
order by conrelid::regclass::text,conname;
