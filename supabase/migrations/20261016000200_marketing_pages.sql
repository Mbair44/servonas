begin;
create table public.marketing_pages(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 page_type text not null check(page_type in('general','bundle')), slug text not null check(slug~'^[a-z0-9-]{2,80}$'),
 status text not null default 'draft' check(status in('draft','published','archived')), title text not null, headline text not null,
 seo_title text, meta_description text, primary_cta_label text, primary_cta_url text, secondary_cta_label text, secondary_cta_url text, content_sections jsonb not null default '[]'::jsonb,
 bundle_id uuid references public.rental_bundles(id) on delete set null, published_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
 unique(business_id,slug)
);
create index marketing_pages_public_slug_idx on public.marketing_pages(business_id,slug) where status='published';
alter table public.marketing_pages enable row level security;
create policy "members read marketing pages" on public.marketing_pages for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage marketing pages" on public.marketing_pages for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
create function public.prevent_marketing_page_slug_collision() returns trigger language plpgsql set search_path=public as $$
begin
 if new.slug in ('booking','cancel','success','rentals','api','app','sites','sitemap.xml','robots.txt') or exists(select 1 from public.promotions p where p.business_id=new.business_id and lower(p.slug)=lower(new.slug)) or exists(select 1 from public.business_location_pages p where p.business_id=new.business_id and lower(p.slug)=lower(new.slug)) or exists(select 1 from public.category_website_pages p where p.business_id=new.business_id and lower(p.slug)=lower(new.slug)) then raise exception 'marketing_page_slug_collision'; end if;
 return new;
end $$;
create trigger marketing_page_slug_collision before insert or update of slug on public.marketing_pages for each row execute function public.prevent_marketing_page_slug_collision();
commit;
