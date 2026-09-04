begin;

create table if not exists public.business_local_seo_recommendation_states(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  dedupe_key text not null,
  status text not null default 'open' check(status in('open','dismissed','completed')),
  metadata jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique(business_id,dedupe_key)
);
create index if not exists business_local_seo_recommendation_states_status_idx on public.business_local_seo_recommendation_states(business_id,status,updated_at desc);

create table if not exists public.business_seo_entity_mappings(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_entity_type text not null check(source_entity_type in('service','inventory_item','location','review','google_profile')),
  source_entity_id text not null,
  target_type text not null check(target_type in('website_service_page','website_location_page','google_business_service','google_business_product','google_business_profile')),
  target_id text,
  status text not null default 'draft' check(status in('draft','planned','published','manual_review','synced','dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique(business_id,source_entity_type,source_entity_id,target_type)
);
create index if not exists business_seo_entity_mappings_target_idx on public.business_seo_entity_mappings(business_id,target_type,status,updated_at desc);

alter table public.business_local_seo_recommendation_states enable row level security;
alter table public.business_seo_entity_mappings enable row level security;

create policy "members read local seo recommendation states" on public.business_local_seo_recommendation_states
  for select to authenticated using(public.is_business_member(business_id));
create policy "managers insert local seo recommendation states" on public.business_local_seo_recommendation_states
  for insert to authenticated with check(public.has_business_role(business_id,array['owner','admin']));
create policy "managers update local seo recommendation states" on public.business_local_seo_recommendation_states
  for update to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));

create policy "members read seo entity mappings" on public.business_seo_entity_mappings
  for select to authenticated using(public.is_business_member(business_id));
create policy "managers insert seo entity mappings" on public.business_seo_entity_mappings
  for insert to authenticated with check(public.has_business_role(business_id,array['owner','admin']));
create policy "managers update seo entity mappings" on public.business_seo_entity_mappings
  for update to authenticated using(public.has_business_role(business_id,array['owner','admin'])) with check(public.has_business_role(business_id,array['owner','admin']));

notify pgrst,'reload schema';
commit;
