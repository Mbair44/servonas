-- Epic 7.5: minimal decision provenance and immutable route identity snapshots.
-- This adds no AI provider or autonomous behavior.
begin;

create table public.operational_decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid,
  route_plan_id uuid,
  technician_id uuid,
  decision_type text not null,
  source text not null default 'manual',
  lifecycle_status text not null default 'generated',
  strategy text,
  decision_key text,
  score numeric,
  confidence numeric,
  reasons jsonb not null default '[]'::jsonb,
  alternatives jsonb not null default '[]'::jsonb,
  explanation jsonb not null default '{}'::jsonb,
  context_snapshot jsonb not null default '{}'::jsonb,
  before_metrics jsonb not null default '{}'::jsonb,
  after_metrics jsonb not null default '{}'::jsonb,
  override_reason text,
  generated_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_decisions_job_tenant_fk foreign key(business_id,job_id)
    references public.jobs(business_id,id),
  constraint operational_decisions_plan_tenant_fk foreign key(business_id,route_plan_id)
    references public.route_plans(business_id,id),
  constraint operational_decisions_technician_tenant_fk foreign key(business_id,technician_id)
    references public.technician_profiles(business_id,id),
  constraint operational_decisions_type_check check(length(trim(decision_type))>0),
  constraint operational_decisions_source_check check(source in (
    'legacy','manual','dispatcher','territory','recurring_preference',
    'customer_request','import','rule','optimization','ai'
  )),
  constraint operational_decisions_lifecycle_check check(lifecycle_status in (
    'generated','accepted','modified','rejected','expired','applied','superseded'
  )),
  constraint operational_decisions_score_check check(score is null or score between -1000000 and 1000000),
  constraint operational_decisions_confidence_check check(confidence is null or confidence between 0 and 1),
  constraint operational_decisions_json_check check(
    jsonb_typeof(reasons)='array' and jsonb_typeof(alternatives)='array'
    and jsonb_typeof(explanation)='object' and jsonb_typeof(context_snapshot)='object'
    and jsonb_typeof(before_metrics)='object' and jsonb_typeof(after_metrics)='object'
  ),
  constraint operational_decisions_time_check check(
    (lifecycle_status='generated' and decided_at is null)
    or lifecycle_status<>'generated'
  )
);
create unique index operational_decisions_business_id_id_unique
  on public.operational_decisions(business_id,id);
create unique index operational_decisions_idempotency_unique
  on public.operational_decisions(business_id,decision_key) where decision_key is not null;
create index operational_decisions_business_time_idx
  on public.operational_decisions(business_id,generated_at desc);
create index operational_decisions_job_time_idx
  on public.operational_decisions(business_id,job_id,generated_at desc) where job_id is not null;
create index operational_decisions_plan_time_idx
  on public.operational_decisions(business_id,route_plan_id,generated_at desc) where route_plan_id is not null;
create index operational_decisions_source_outcome_idx
  on public.operational_decisions(business_id,source,lifecycle_status,generated_at desc);

alter table public.operational_decisions enable row level security;
create policy "office manages operational decisions" on public.operational_decisions
  for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']))
  with check(public.has_business_role(business_id,array['owner','admin','manager']));
create trigger operational_decisions_updated_at before update on public.operational_decisions
for each row execute function public.set_routing_updated_at();

alter table public.job_assignments add column assignment_source text;
-- The primary-assignment guard protects all active-primary row updates. This
-- backfill changes provenance metadata only, so use the same transaction-local
-- synchronization flag as set_job_primary_technician().
select set_config('servonas.assignment_sync','on',true);
update public.job_assignments set assignment_source='legacy' where assignment_source is null;
select set_config('servonas.assignment_sync','off',true);
alter table public.job_assignments alter column assignment_source set default 'manual';
alter table public.job_assignments alter column assignment_source set not null;
alter table public.job_assignments
  add column assignment_reason text,
  add column operational_decision_id uuid;
alter table public.job_assignments add constraint job_assignments_source_check check(assignment_source in (
  'legacy','manual','dispatcher','territory','recurring_preference',
  'customer_request','import','rule','optimization','ai'
));
alter table public.job_assignments add constraint job_assignments_decision_tenant_fk
  foreign key(business_id,operational_decision_id)
  references public.operational_decisions(business_id,id);
create index job_assignments_decision_idx on public.job_assignments(business_id,operational_decision_id)
  where operational_decision_id is not null;

alter table public.technician_routes
  add column technician_display_name_snapshot text;
alter table public.route_stops
  add column job_number_snapshot bigint,
  add column job_title_snapshot text,
  add column customer_display_name_snapshot text,
  add column service_name_snapshot text,
  add column service_location_label_snapshot text;

-- Backfill is explicitly a current-state bootstrap. New calculations capture
-- values at calculation time and therefore remain stable if source rows change.
update public.technician_routes tr
set technician_display_name_snapshot=tp.display_name
from public.technician_profiles tp
where tp.business_id=tr.business_id and tp.id=tr.technician_id
  and tr.technician_display_name_snapshot is null;

update public.route_stops rs
set job_number_snapshot=j.job_number,
    job_title_snapshot=j.title,
    customer_display_name_snapshot=coalesce(nullif(c.company_name,''),nullif(trim(concat_ws(' ',c.first_name,c.last_name)),''),'Customer'),
    service_name_snapshot=coalesce(s.name,'Custom work'),
    service_location_label_snapshot=coalesce(sl.location_name,'Service location')
from public.jobs j
left join public.customers c on c.business_id=j.business_id and c.id=j.customer_id
left join public.services s on s.business_id=j.business_id and s.id=j.service_id
left join public.service_locations sl on sl.business_id=j.business_id and sl.id=j.service_location_id
where j.business_id=rs.business_id and j.id=rs.job_id;

comment on table public.operational_decisions is
  'Provider-neutral human, rule, optimization, import, and future AI decision history with structured explanation and outcome metadata.';
comment on column public.operational_decisions.context_snapshot is
  'Normalized facts used when the decision was generated. Avoid secrets, unnecessary PII, and mutable live-record assumptions.';
comment on column public.job_assignments.assignment_source is
  'Provenance for the assignment. Existing rows are legacy; new rows default to manual unless a narrow operation supplies a more specific source.';
comment on column public.technician_routes.technician_display_name_snapshot is
  'Technician identity label captured for historical route reporting; not an authorization source.';

commit;
