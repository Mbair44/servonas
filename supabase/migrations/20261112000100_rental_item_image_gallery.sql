-- Canonical, ordered rental gallery. Compatibility columns remain populated for
-- existing public and booking readers while applications migrate to this table.
alter table public.inventory_items add column if not exists image_urls text[] not null default '{}';
create unique index if not exists inventory_items_id_business_id_key on public.inventory_items(id,business_id);

create table if not exists public.rental_item_images (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 inventory_item_id uuid not null,
 image_url text not null check (char_length(image_url) between 1 and 2000),
 alt_text text check (alt_text is null or char_length(alt_text)<=300),
 sort_order integer not null check(sort_order>=0 and sort_order<10),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(inventory_item_id,image_url),
 unique(inventory_item_id,sort_order),
 foreign key(inventory_item_id,business_id) references public.inventory_items(id,business_id) on delete cascade
);
-- A prior interrupted/manual attempt may have created the table but not every
-- constraint. Repair that state without replacing valid existing rows.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.rental_item_images'::regclass and contype='f' and confrelid='public.inventory_items'::regclass and pg_get_constraintdef(oid) like '%FOREIGN KEY (inventory_item_id, business_id)%') then
  alter table public.rental_item_images add constraint rental_item_images_tenant_item_fkey foreign key(inventory_item_id,business_id) references public.inventory_items(id,business_id) on delete cascade;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.rental_item_images'::regclass and contype='u' and pg_get_constraintdef(oid) like '%UNIQUE (inventory_item_id, image_url)%') then
  alter table public.rental_item_images add constraint rental_item_images_item_url_key unique(inventory_item_id,image_url);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.rental_item_images'::regclass and contype='u' and pg_get_constraintdef(oid) like '%UNIQUE (inventory_item_id, sort_order)%') then
  alter table public.rental_item_images add constraint rental_item_images_item_sort_key unique(inventory_item_id,sort_order);
 end if;
end $$;
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

-- Legacy backfill is idempotent and never overwrites a canonical image.
insert into public.rental_item_images(business_id,inventory_item_id,image_url,sort_order)
select i.business_id,i.id,legacy.image_url,legacy.sort_order
from public.inventory_items i
cross join lateral (
 select image_url,(row_number() over(order by ordinality)-1)::integer sort_order
 from (
  select distinct on (u.image_url) u.image_url,u.ordinality
  from unnest(array_prepend(i.image_url,i.image_urls)) with ordinality as u(image_url,ordinality)
  where nullif(btrim(u.image_url),'') is not null
  order by u.image_url,u.ordinality
 ) distinct_legacy
 order by ordinality
 limit 10
) legacy
where i.business_id is not null
on conflict(inventory_item_id,image_url) do nothing;

update public.inventory_items i set image_urls=coalesce(g.urls,'{}'::text[]),image_url=g.primary_url
from (
 select r.inventory_item_id,r.business_id,array_agg(r.image_url order by r.sort_order,r.created_at) urls,(array_agg(r.image_url order by r.sort_order,r.created_at))[1] primary_url
 from public.rental_item_images r
 group by r.inventory_item_id,r.business_id
) g
where i.id=g.inventory_item_id and i.business_id=g.business_id and (i.image_urls is distinct from g.urls or i.image_url is distinct from g.primary_url);

-- This migration intentionally does not replace pre-existing storage policies.
-- Existing inventory-images object policies remain authoritative; applications
-- additionally verify tenant-prefixed paths before attaching any object.

-- Storage deletion is deliberately decoupled from gallery writes. A delete can
-- be rolled back or immediately followed by a reattach, so the worker checks
-- every possible canonical and legacy reference just before removing objects.
create table if not exists public.rental_image_cleanup_jobs (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 image_url text not null check (char_length(image_url) between 1 and 2000),
 attempt_count integer not null default 0 check (attempt_count>=0),
 next_attempt_at timestamptz not null default (now()+interval '5 minutes'),
 last_error text,
 created_at timestamptz not null default now(),
 unique(business_id,image_url)
);
create index if not exists rental_image_cleanup_jobs_due_idx on public.rental_image_cleanup_jobs(next_attempt_at);
alter table public.rental_image_cleanup_jobs enable row level security;

create or replace function public.queue_rental_image_cleanup() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.rental_image_cleanup_jobs(business_id,image_url)
 values(old.business_id,old.image_url)
 on conflict(business_id,image_url) do update set next_attempt_at=least(public.rental_image_cleanup_jobs.next_attempt_at,now());
 return old;
end $$;
drop trigger if exists rental_item_images_queue_cleanup on public.rental_item_images;
create trigger rental_item_images_queue_cleanup after delete on public.rental_item_images for each row execute function public.queue_rental_image_cleanup();

create or replace function public.replace_rental_item_images(p_item_id uuid,p_business_id uuid,p_urls text[],p_expected_updated_at timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare v_updated timestamptz; v_url text; v_position integer:=0;
begin
 if auth.uid() is null or not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'not authorized to update this rental gallery'; end if;
 if cardinality(p_urls)>10 or p_urls is null or cardinality(array(select distinct unnest(p_urls)))<>cardinality(p_urls) then raise exception 'invalid rental gallery'; end if;
 select updated_at into v_updated from public.inventory_items where id=p_item_id and business_id=p_business_id for update;
 if not found then raise exception 'rental not found'; end if;
 if p_expected_updated_at is not null and v_updated is distinct from p_expected_updated_at then raise exception 'gallery changed by another editor'; end if;
 delete from public.rental_item_images where inventory_item_id=p_item_id and business_id=p_business_id;
 foreach v_url in array p_urls loop
  insert into public.rental_item_images(business_id,inventory_item_id,image_url,sort_order) values(p_business_id,p_item_id,v_url,v_position);
  v_position:=v_position+1;
 end loop;
 update public.inventory_items set updated_at=now() where id=p_item_id and business_id=p_business_id;
end $$;
grant execute on function public.replace_rental_item_images(uuid,uuid,text[],timestamptz) to authenticated;
