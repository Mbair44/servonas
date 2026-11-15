-- Ordered, tenant-scoped rental product photos. inventory_items.image_url and
-- image_urls remain compatibility projections of this canonical table.
alter table public.inventory_items add column if not exists image_urls text[] not null default '{}';
create unique index if not exists inventory_items_id_business_id_key on public.inventory_items(id,business_id);

create table if not exists public.rental_item_images (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 inventory_item_id uuid not null,
 image_url text not null check (char_length(image_url) between 1 and 2000),
 alt_text text check (alt_text is null or char_length(alt_text)<=300),
 sort_order integer not null check(sort_order>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(inventory_item_id,image_url),
 unique(inventory_item_id,sort_order),
 foreign key(inventory_item_id,business_id) references public.inventory_items(id,business_id) on delete cascade
);
create index if not exists rental_item_images_business_item_sort_idx on public.rental_item_images(business_id,inventory_item_id,sort_order);
alter table public.rental_item_images enable row level security;
drop policy if exists "members view rental image metadata" on public.rental_item_images;
drop policy if exists "managers manage rental image metadata" on public.rental_item_images;
create policy "members view rental image metadata" on public.rental_item_images for select to authenticated using(public.is_business_member(business_id));
create policy "managers manage rental image metadata" on public.rental_item_images for all to authenticated using(public.has_business_role(business_id,array['owner','admin','manager'])) with check(public.has_business_role(business_id,array['owner','admin','manager']));
grant select,insert,update,delete on public.rental_item_images to authenticated;

create or replace function public.sync_rental_item_image_compatibility() returns trigger language plpgsql security definer set search_path=public as $$
declare v_item uuid:=coalesce(new.inventory_item_id,old.inventory_item_id); v_business uuid:=coalesce(new.business_id,old.business_id); v_urls text[];
begin
 select coalesce(array_agg(image_url order by sort_order,created_at),'{}'::text[]) into v_urls from public.rental_item_images where inventory_item_id=v_item and business_id=v_business;
 update public.inventory_items set image_urls=v_urls,image_url=nullif(v_urls[1],'') where id=v_item and business_id=v_business;
 return coalesce(new,old);
end $$;
drop trigger if exists rental_item_images_sync_compatibility on public.rental_item_images;
create trigger rental_item_images_sync_compatibility after insert or update or delete on public.rental_item_images for each row execute function public.sync_rental_item_image_compatibility();

-- Backfill preserves every legacy primary image. This can run again safely.
insert into public.rental_item_images(business_id,inventory_item_id,image_url,sort_order)
select i.business_id,i.id,i.image_url,0 from public.inventory_items i
where i.business_id is not null and nullif(btrim(i.image_url),'') is not null
on conflict(inventory_item_id,image_url) do nothing;
insert into public.rental_item_images(business_id,inventory_item_id,image_url,sort_order)
select i.business_id,i.id,url.image_url,url.ordinality::integer
from public.inventory_items i cross join lateral unnest(i.image_urls) with ordinality as url(image_url,ordinality)
where i.business_id is not null and nullif(btrim(url.image_url),'') is not null
on conflict do nothing;

-- Canonical table owns the compatibility projection. Handles a partially
-- applied run as well as pre-existing image_urls data without changing image_url.
update public.inventory_items i set image_urls=coalesce(g.urls,'{}'::text[]),image_url=g.primary_url
from lateral (
 select array_agg(r.image_url order by r.sort_order,r.created_at) urls,
        (array_agg(r.image_url order by r.sort_order,r.created_at))[1] primary_url
 from public.rental_item_images r where r.inventory_item_id=i.id and r.business_id=i.business_id
) g
where i.business_id is not null and (i.image_urls is distinct from coalesce(g.urls,'{}'::text[]) or i.image_url is distinct from g.primary_url);

-- The existing inventory-images bucket is intentionally public because rental
-- photos are customer-facing. Upload/delete remain tenant-scoped by path.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('inventory-images','inventory-images',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "rental image managers upload tenant objects" on storage.objects;
drop policy if exists "rental image managers remove tenant objects" on storage.objects;
create policy "rental image managers upload tenant objects" on storage.objects for insert to authenticated with check(bucket_id='inventory-images' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager']));
create policy "rental image managers remove tenant objects" on storage.objects for delete to authenticated using(bucket_id='inventory-images' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager']));
