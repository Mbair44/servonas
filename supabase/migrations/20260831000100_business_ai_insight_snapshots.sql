create table if not exists public.business_ai_insight_snapshots(
  business_id uuid not null references public.businesses(id) on delete cascade,
  scope text not null default 'marketing_funnel',
  input_hash text not null,
  insights jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  rule_version integer not null default 1,
  used_llm boolean not null default false,
  primary key (business_id, scope)
);

create index if not exists business_ai_insight_snapshots_generated_idx
  on public.business_ai_insight_snapshots(generated_at desc);

alter table public.business_ai_insight_snapshots enable row level security;

drop policy if exists "members read ai insight snapshots" on public.business_ai_insight_snapshots;
create policy "members read ai insight snapshots"
  on public.business_ai_insight_snapshots
  for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "owners admins manage ai insight snapshots" on public.business_ai_insight_snapshots;
create policy "owners admins manage ai insight snapshots"
  on public.business_ai_insight_snapshots
  for all
  to authenticated
  using (public.has_business_role(business_id, array['owner','admin']))
  with check (public.has_business_role(business_id, array['owner','admin']));

comment on table public.business_ai_insight_snapshots is 'Tenant-scoped cached deterministic AI insight results for Servonas reporting surfaces.';
