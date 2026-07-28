-- Run after 20260728000500 and before validating its NOT VALID foreign keys.
select 'candidate_entity_tenant_mismatch' as audit,count(*) as failing_rows
from public.customer_import_duplicate_candidates c
left join public.customer_import_entities e on e.business_id=c.business_id and e.import_id=c.import_id and e.id=c.entity_id
where e.id is null
union all
select 'decision_entity_tenant_mismatch',count(*)
from public.customer_import_duplicate_decisions d
left join public.customer_import_entities e on e.business_id=d.business_id and e.import_id=d.import_id and e.id=d.entity_id
where e.id is null
union all
select 'decision_candidate_tenant_mismatch',count(*)
from public.customer_import_duplicate_decisions d
left join public.customer_import_duplicate_candidates c on c.business_id=d.business_id and c.id=d.candidate_id
where d.candidate_id is not null and c.id is null;

-- Only after all three counts are zero:
-- alter table public.customer_import_duplicate_candidates validate constraint customer_import_duplicate_candidates_entity_tenant_fk;
-- alter table public.customer_import_duplicate_decisions validate constraint customer_import_duplicate_decisions_entity_tenant_fk;
-- alter table public.customer_import_duplicate_decisions validate constraint customer_import_duplicate_decisions_candidate_tenant_fk;
