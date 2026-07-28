-- Epic 2.4 production verification. Run in Supabase SQL Editor after applying
-- migrations through 20260728000800. All count results should be zero and all
-- readiness booleans should be true.
select count(*) as businesses_without_entitlement
from public.businesses b
where b.is_deleted=false
and not exists(select 1 from public.business_entitlements e where e.business_id=b.id);

select count(*) as overlapping_primary_entitlements
from(
 select business_id from public.business_entitlements
 where status in('scheduled','active','grace_period')
 group by business_id having count(*)>1
)x;

select count(*) as invalid_entitlement_dates
from public.business_entitlements
where ends_at is not null and ends_at<=starts_at
   or grace_period_ends_at is not null and(ends_at is null or grace_period_ends_at<=ends_at);

select count(*) as duplicate_backfill_audits
from(
 select entitlement_id from public.business_entitlement_audit_events
 where event_type='existing_tenant_backfilled'
 group by entitlement_id having count(*)>1
)x;

select
 to_regprocedure('public.ensure_pilot_entitlement(uuid,uuid,text)') is not null as pilot_helper_ready,
 to_regprocedure('public.manage_business_entitlement(uuid,uuid,integer,text,text,timestamp with time zone)') is not null as lifecycle_command_ready,
 to_regprocedure('public.grant_pilot_entitlement_admin(uuid,text)') is not null as grant_command_ready,
 to_regprocedure('public.record_entitlement_access_denied(uuid,text,text)') is not null as denial_audit_ready,
 to_regprocedure('public.is_servonas_platform_admin()') is not null as platform_admin_guard_ready;

select policyname,cmd,roles
from pg_policies
where schemaname='public'
and tablename in('business_entitlements','business_entitlement_audit_events')
order by tablename,policyname;

-- Manual authenticated checks:
-- 1. As a normal tenant user, SELECT sees only memberships and both lifecycle
--    RPCs must return 42501.
-- 2. As a confirmed @servonas.com user, lifecycle commands accept only the
--    target row's current version and write one audit event.
-- 3. Attempt a Tenant A entitlement ID with Tenant B business_id; expect P0002.
-- 4. Repeat a stale version; expect 40001.
-- 5. Suspend, verify writes are denied while reads work, then restore.
