-- Dry run before Epic 2.4 foundation.
select count(*) as businesses_without_entitlement from public.businesses b where not exists(select 1 from public.business_entitlements e where e.business_id=b.id);
select entitlement_key,status,source,count(*) from public.business_entitlements group by entitlement_key,status,source order by 1,2,3;
select business_id,count(*) as overlapping_primary_rows from public.business_entitlements where status in('scheduled','active','grace_period') group by business_id having count(*)>1;
select id,business_id,entitlement_key,status from public.business_entitlements where entitlement_key not in('pilot','starter','growth','business','enterprise') or status not in('active','inactive','expired','scheduled','grace_period','suspended','canceled','superseded');
-- Post-run verification. All counts should be zero.
select count(*) as businesses_still_without_entitlement from public.businesses b where not exists(select 1 from public.business_entitlements e where e.business_id=b.id);
select count(*) as duplicate_backfill_audits from(select entitlement_id,count(*) from public.business_entitlement_audit_events where event_type='existing_tenant_backfilled' group by entitlement_id having count(*)>1)x;
-- Validate only after the unknown-code query above returns no rows:
-- alter table public.business_entitlements validate constraint business_entitlements_code_check;
