begin;
create table public.territory_scenario_decisions(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 scenario_id uuid not null,
 scenario_version integer not null check(scenario_version>0),
 simulation_revision integer not null check(simulation_revision>=0),
 source text not null check(source in ('human','business_rules','optimization','ai')),
 source_version text not null,
 recommendation_key text not null,
 score numeric(6,2) check(score between 0 and 100),
 category_scores jsonb not null default '{}',
 input_snapshot jsonb not null default '{}',
 explanation jsonb not null default '{}',
 outcome text not null default 'pending' check(outcome in ('pending','accepted','modified','rejected','expired')),
 actor_user_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(business_id,scenario_id) references public.territory_scenarios(business_id,id),
 check(jsonb_typeof(category_scores)='object' and jsonb_typeof(input_snapshot)='object' and jsonb_typeof(explanation)='object')
);
create index territory_scenario_decisions_history on public.territory_scenario_decisions(business_id,scenario_id,created_at desc);
alter table public.territory_scenario_decisions enable row level security;
create policy "office reads scenario decisions" on public.territory_scenario_decisions for select to authenticated
 using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners record scenario decisions" on public.territory_scenario_decisions for insert to authenticated
 with check(public.has_business_role(business_id,array['owner','admin']) and actor_user_id=auth.uid());
create or replace function public.prevent_territory_scenario_decision_mutation() returns trigger language plpgsql as $$
begin raise exception 'Territory scenario decisions are immutable; record a new decision outcome';end$$;
create trigger territory_scenario_decisions_immutable before update or delete on public.territory_scenario_decisions
for each row execute function public.prevent_territory_scenario_decision_mutation();
comment on table public.territory_scenario_decisions is
 'Immutable, provider-neutral recommendation and outcome history. AI is an optional future source; no model execution is implemented by this migration.';
commit;
