begin;

create table if not exists public.business_location_pages(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_location_key text not null,
  city text not null,
  state text,
  slug text not null,
  status text not null default 'draft' check(status in('draft','published','archived')),
  page_title text not null,
  meta_description text not null,
  og_title text not null,
  og_description text not null,
  h1 text not null,
  hero_copy text not null,
  cta_label text not null,
  sections jsonb not null default '[]'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  schema_json jsonb not null default '{}'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  source_version text not null,
  similarity_score numeric(5,4),
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique(business_id,source_location_key)
);

create unique index if not exists business_location_pages_business_slug_lower_key
  on public.business_location_pages(business_id,lower(slug));
create index if not exists business_location_pages_public_idx
  on public.business_location_pages(business_id,status,published_at desc);

alter table public.business_location_pages enable row level security;
create policy "members read location pages" on public.business_location_pages
  for select to authenticated using(public.is_business_member(business_id));
create policy "managers insert location pages" on public.business_location_pages
  for insert to authenticated with check(public.has_business_role(business_id,array['owner','admin']));
create policy "managers update location pages" on public.business_location_pages
  for update to authenticated using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));

notify pgrst,'reload schema';
commit;
