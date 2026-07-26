begin;

create table public.employee_scheduling_preferences (
  employee_id uuid primary key,
  business_id uuid not null,
  preferred_work_types text[] not null default '{}',
  avoided_work_types text[] not null default '{}',
  preferred_start_time time,
  preferred_end_time time,
  workload_preference text not null default 'balanced',
  customer_interaction_preference text not null default 'no_preference',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint employee_preferences_employee_fk foreign key(business_id,employee_id)
    references public.employees(business_id,id) on delete cascade,
  constraint employee_preferences_tenant_unique unique(business_id,employee_id),
  constraint employee_preferences_workload_check check(workload_preference in (
    'lighter','balanced','higher','overtime_welcome','no_preference'
  )),
  constraint employee_preferences_customer_check check(customer_interaction_preference in (
    'relationship_continuity','new_customers','no_preference'
  )),
  constraint employee_preferences_hours_check check(
    preferred_end_time is null or preferred_start_time is null or preferred_end_time>preferred_start_time
  ),
  constraint employee_preferences_notes_check check(notes is null or length(notes)<=2000)
);

create table public.customer_employee_preferences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  employee_id uuid not null,
  preference_type text not null,
  reason text,
  effective_from date not null default current_date,
  effective_through date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  ended_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint customer_employee_preferences_customer_fk foreign key(business_id,customer_id)
    references public.customers(business_id,id) on delete cascade,
  constraint customer_employee_preferences_employee_fk foreign key(business_id,employee_id)
    references public.employees(business_id,id) on delete restrict,
  constraint customer_employee_preferences_type_check check(preference_type in (
    'preferred','avoid','required','continuity'
  )),
  constraint customer_employee_preferences_dates_check check(
    effective_through is null or effective_through>=effective_from
  ),
  constraint customer_employee_preferences_reason_check check(reason is null or length(reason)<=1000)
);
create unique index customer_employee_preferences_active_unique
  on public.customer_employee_preferences(business_id,customer_id,employee_id,preference_type)
  where is_active;
create index customer_employee_preferences_customer_lookup
  on public.customer_employee_preferences(business_id,customer_id,is_active);

create table public.workforce_decision_signals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  job_id uuid,
  selected_employee_id uuid,
  alternative_employee_id uuid,
  decision_type text not null,
  decision_source text not null,
  outcome text not null,
  override_reason text,
  context_snapshot jsonb not null default '{}',
  before_snapshot jsonb not null default '{}',
  after_snapshot jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint workforce_signals_business_fk foreign key(business_id)
    references public.businesses(id) on delete restrict,
  constraint workforce_signals_job_fk foreign key(business_id,job_id)
    references public.jobs(business_id,id) on delete restrict,
  constraint workforce_signals_selected_employee_fk foreign key(business_id,selected_employee_id)
    references public.employees(business_id,id) on delete restrict,
  constraint workforce_signals_alternative_employee_fk foreign key(business_id,alternative_employee_id)
    references public.employees(business_id,id) on delete restrict,
  constraint workforce_signals_type_check check(decision_type in (
    'assignment','schedule','territory','workload','customer_preference'
  )),
  constraint workforce_signals_source_check check(decision_source in (
    'manual','dispatcher','customer_request','rule','optimization','import','ai'
  )),
  constraint workforce_signals_outcome_check check(outcome in (
    'accepted','modified','overridden','rejected','expired','applied'
  )),
  constraint workforce_signals_override_reason_check check(
    outcome<>'overridden' or length(btrim(coalesce(override_reason,'')))>0
  ),
  constraint workforce_signals_json_check check(
    jsonb_typeof(context_snapshot)='object'
    and jsonb_typeof(before_snapshot)='object'
    and jsonb_typeof(after_snapshot)='object'
  )
);
create index workforce_decision_signals_employee_time
  on public.workforce_decision_signals(business_id,selected_employee_id,occurred_at desc);
create index workforce_decision_signals_job_time
  on public.workforce_decision_signals(business_id,job_id,occurred_at desc);

alter table public.employee_scheduling_preferences enable row level security;
alter table public.customer_employee_preferences enable row level security;
alter table public.workforce_decision_signals enable row level security;

create policy "office reads employee scheduling preferences" on public.employee_scheduling_preferences
  for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer employee scheduling preferences" on public.employee_scheduling_preferences
  for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "employees read own scheduling preferences" on public.employee_scheduling_preferences
  for select to authenticated using(exists(
    select 1 from public.employees employee where employee.business_id=employee_scheduling_preferences.business_id
      and employee.id=employee_scheduling_preferences.employee_id and employee.auth_user_id=auth.uid()
  ));
create policy "office manages customer employee preferences" on public.customer_employee_preferences
  for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']))
  with check(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "office manages workforce decision signals" on public.workforce_decision_signals
  for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']))
  with check(public.has_business_role(business_id,array['owner','admin','manager']));

create trigger employee_scheduling_preferences_updated_at
before update on public.employee_scheduling_preferences
for each row execute function public.set_routing_updated_at();

create view public.employee_workforce_feature_summary
with (security_invoker=true) as
select
  employee.business_id,
  employee.id as employee_id,
  employee.preferred_name,
  count(*) filter(where fact.metric_type='job_completed')::integer as historical_jobs_completed,
  coalesce(sum(fact.duration_seconds) filter(where fact.metric_type='service_duration'),0)::bigint
    as historical_service_seconds,
  round(avg(fact.duration_seconds) filter(where fact.metric_type='service_duration'))::bigint
    as average_completion_seconds,
  round(avg(fact.duration_seconds) filter(where fact.metric_type in ('drive_time_actual','drive_time_estimated')))::bigint
    as average_travel_seconds,
  coalesce(sum(fact.distance_meters) filter(where fact.metric_type in ('drive_time_actual','drive_time_estimated')),0)::bigint
    as historical_travel_meters,
  coalesce(sum(fact.amount_cents) filter(where fact.metric_type='revenue_generated'),0)::bigint
    as historical_revenue_cents,
  round(avg(fact.rating_value) filter(where fact.metric_type='customer_rating'),2) as average_customer_rating,
  count(*) filter(where fact.metric_type='callback')::integer as callback_count,
  count(*) filter(where fact.metric_type='upsell')::integer as upsell_count,
  coalesce(sum(fact.amount_cents) filter(where fact.metric_type='collection'),0)::bigint
    as historical_collections_cents
from public.employees employee
left join public.workforce_metric_facts fact
  on fact.business_id=employee.business_id and fact.employee_id=employee.id
group by employee.business_id,employee.id,employee.preferred_name;

comment on table public.employee_scheduling_preferences is
  'Explicit human-entered preferences only. These are future scheduling inputs, not recommendations or authorization rules.';
comment on table public.customer_employee_preferences is
  'Effective-dated customer continuity, preference, avoidance, or requirement signals. Reasons should avoid sensitive personal data.';
comment on table public.workforce_decision_signals is
  'Append-oriented dispatcher and future algorithm decision outcomes. Context snapshots preserve explainability without implementing recommendations.';
comment on view public.employee_workforce_feature_summary is
  'Read-only, tenant-RLS-respecting historical aggregates in cents, seconds, and meters for future reporting and model features.';

commit;
