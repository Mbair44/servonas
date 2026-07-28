-- Forward-only hardening for databases that applied Epic 2.3 Checkpoints 1-10 before the final review.
create unique index if not exists customer_import_entities_tenant_import_id_idx on public.customer_import_entities(business_id,import_id,id);
create unique index if not exists customer_import_duplicate_candidates_tenant_id_idx on public.customer_import_duplicate_candidates(business_id,id);

alter table public.customer_import_duplicate_candidates drop constraint if exists customer_import_duplicate_candidates_business_id_entity_id_fkey;
alter table public.customer_import_duplicate_candidates drop constraint if exists customer_import_duplicate_candidates_entity_tenant_fk;
alter table public.customer_import_duplicate_candidates add constraint customer_import_duplicate_candidates_entity_tenant_fk
 foreign key(business_id,import_id,entity_id) references public.customer_import_entities(business_id,import_id,id) on delete cascade not valid;

alter table public.customer_import_duplicate_decisions drop constraint if exists customer_import_duplicate_decisions_business_id_entity_id_fkey;
alter table public.customer_import_duplicate_decisions drop constraint if exists customer_import_duplicate_decisions_entity_tenant_fk;
alter table public.customer_import_duplicate_decisions add constraint customer_import_duplicate_decisions_entity_tenant_fk
 foreign key(business_id,import_id,entity_id) references public.customer_import_entities(business_id,import_id,id) on delete cascade not valid;
alter table public.customer_import_duplicate_decisions drop constraint if exists customer_import_duplicate_decisions_candidate_tenant_fk;
alter table public.customer_import_duplicate_decisions add constraint customer_import_duplicate_decisions_candidate_tenant_fk
 foreign key(business_id,candidate_id) references public.customer_import_duplicate_candidates(business_id,id) on delete restrict not valid;

drop policy if exists "customer managers delete import rows" on public.customer_import_rows;
create policy "customer managers delete import rows" on public.customer_import_rows for delete to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
drop policy if exists "customer managers delete import mappings" on public.customer_import_mappings;
create policy "customer managers delete import mappings" on public.customer_import_mappings for delete to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
drop policy if exists "customer managers delete import entities" on public.customer_import_entities;
create policy "customer managers delete import entities" on public.customer_import_entities for delete to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
drop policy if exists "customer managers delete duplicate candidates" on public.customer_import_duplicate_candidates;
create policy "customer managers delete duplicate candidates" on public.customer_import_duplicate_candidates for delete to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));

comment on constraint customer_import_duplicate_candidates_entity_tenant_fk on public.customer_import_duplicate_candidates is 'NOT VALID until the Epic 2.3 tenant-integrity audit returns zero rows.';
comment on constraint customer_import_duplicate_decisions_entity_tenant_fk on public.customer_import_duplicate_decisions is 'NOT VALID until the Epic 2.3 tenant-integrity audit returns zero rows.';
comment on constraint customer_import_duplicate_decisions_candidate_tenant_fk on public.customer_import_duplicate_decisions is 'NOT VALID until the Epic 2.3 tenant-integrity audit returns zero rows.';
