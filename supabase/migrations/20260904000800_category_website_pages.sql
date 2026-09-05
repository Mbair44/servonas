begin;
create table if not exists public.category_website_pages(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 category_id uuid not null references public.rental_inventory_categories(id) on delete cascade,
 slug text not null, status text not null default 'draft' check(status in('draft','published','unpublished')),
 title text not null, intro text, seo_title text, meta_description text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz,
 unique(category_id)
);
create unique index if not exists category_website_pages_business_slug_lower_key on public.category_website_pages(business_id,lower(slug));
alter table public.category_website_pages enable row level security;
create policy "tenant category pages" on public.category_website_pages for all to authenticated using(exists(select 1 from public.business_members member where member.business_id=category_website_pages.business_id and member.user_id=auth.uid())) with check(exists(select 1 from public.business_members member where member.business_id=category_website_pages.business_id and member.user_id=auth.uid()));
notify pgrst,'reload schema';
commit;
