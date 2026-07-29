begin;

-- Route stops and legs are mutable calculation artifacts. Workforce facts are
-- immutable historical snapshots, so recalculation must be allowed to replace
-- those artifacts without deleting the historical measurement. PostgreSQL's
-- column-list SET NULL preserves the tenant key and clears only the obsolete
-- live reference.
alter table public.workforce_metric_facts
  drop constraint if exists workforce_metric_leg_fk,
  drop constraint if exists workforce_metric_route_fk;

alter table public.workforce_metric_facts
  add constraint workforce_metric_route_fk
    foreign key (business_id,technician_route_id)
    references public.technician_routes(business_id,id)
    on delete set null (technician_route_id),
  add constraint workforce_metric_leg_fk
    foreign key (business_id,route_leg_id)
    references public.route_legs(business_id,id)
    on delete set null (route_leg_id);

comment on column public.workforce_metric_facts.route_leg_id is
  'Optional live lineage to the route leg. Cleared when mutable route geometry is rebuilt; source_id and snapshots preserve historical identity.';

comment on column public.workforce_metric_facts.technician_route_id is
  'Optional live lineage to the technician route. Cleared if the mutable route is removed; employee and route metric snapshots remain authoritative.';

commit;
