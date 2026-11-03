-- Aggregate-only consent coverage. Each row is a consent/status observation,
-- not a visitor, session, device, IP address, or other identifier.
create table if not exists public.analytics_consent_observations (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  analytics_status text not null check (analytics_status in ('accepted','rejected','not_selected','unavailable')),
  marketing_status text check (marketing_status in ('accepted','rejected','not_selected','unavailable')),
  observation_kind text not null check (observation_kind in ('decision','status_observed')),
  observed_at timestamptz not null default now()
);

create index if not exists analytics_consent_observations_business_observed_idx
  on public.analytics_consent_observations (business_id, observed_at desc);

alter table public.analytics_consent_observations enable row level security;
drop policy if exists "members view analytics consent observations" on public.analytics_consent_observations;
create policy "members view analytics consent observations"
  on public.analytics_consent_observations for select to authenticated
  using (public.is_business_member(business_id));

-- Public collection is performed only through the server route using service
-- credentials. There is deliberately no public insert policy.
notify pgrst, 'reload schema';
