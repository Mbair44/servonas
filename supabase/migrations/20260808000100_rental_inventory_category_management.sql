begin;

create table if not exists public.rental_inventory_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,id)
);
create unique index if not exists rental_inventory_categories_name_unique
  on public.rental_inventory_categories(business_id,lower(btrim(name)));

alter table public.inventory_items add column if not exists category_id uuid;
alter table public.inventory_items drop constraint if exists inventory_items_rental_category_fk;
alter table public.inventory_items add constraint inventory_items_rental_category_fk
  foreign key(business_id,category_id) references public.rental_inventory_categories(business_id,id) on delete restrict;

insert into public.rental_inventory_categories(business_id,name)
select distinct business_id,btrim(category) from public.inventory_items
where business_id is not null and nullif(btrim(category),'') is not null
on conflict do nothing;
update public.inventory_items item set category_id=category.id
from public.rental_inventory_categories category
where item.business_id=category.business_id and lower(btrim(item.category))=lower(btrim(category.name)) and item.category_id is null;

alter table public.rental_inventory_categories enable row level security;
drop policy if exists "members read rental categories" on public.rental_inventory_categories;
create policy "members read rental categories" on public.rental_inventory_categories for select to authenticated
  using(public.is_business_member(business_id));
drop policy if exists "managers manage rental categories" on public.rental_inventory_categories;
create policy "managers manage rental categories" on public.rental_inventory_categories for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']))
  with check(public.has_business_role(business_id,array['owner','admin','manager']));

create or replace function public.delete_rental_inventory_category(p_business_id uuid,p_category_id uuid,p_replacement_category_id uuid default null)
returns integer language plpgsql security definer set search_path=public as $$
declare v_source public.rental_inventory_categories%rowtype;v_replacement public.rental_inventory_categories%rowtype;v_count integer;
begin
 if not public.has_business_role(p_business_id,array['owner','admin','manager']) then raise exception 'Permission denied' using errcode='42501';end if;
 select * into v_source from public.rental_inventory_categories where id=p_category_id and business_id=p_business_id for update;
 if not found then raise exception 'Category not found' using errcode='P0002';end if;
 select count(*) into v_count from public.inventory_items where business_id=p_business_id and category_id=p_category_id;
 if v_count>0 and p_replacement_category_id is null then raise exception 'Choose a replacement category for the attached rental items' using errcode='23514';end if;
 if p_replacement_category_id is not null then
  if p_replacement_category_id=p_category_id then raise exception 'Choose a different replacement category' using errcode='23514';end if;
  select * into v_replacement from public.rental_inventory_categories where id=p_replacement_category_id and business_id=p_business_id for update;
  if not found then raise exception 'Replacement category not found' using errcode='P0002';end if;
  update public.inventory_items set category_id=v_replacement.id,category=v_replacement.name where business_id=p_business_id and category_id=p_category_id;
 end if;
 delete from public.rental_inventory_categories where id=p_category_id and business_id=p_business_id;
 return v_count;
end $$;
revoke all on function public.delete_rental_inventory_category(uuid,uuid,uuid) from public;
grant execute on function public.delete_rental_inventory_category(uuid,uuid,uuid) to authenticated,service_role;

commit;
