create table if not exists public.rental_item_upsells (
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_item_id uuid not null references public.inventory_items(id) on delete cascade,
  suggested_item_id uuid not null references public.inventory_items(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (source_item_id,suggested_item_id),
  check (source_item_id <> suggested_item_id)
);
create index if not exists rental_item_upsells_business_idx on public.rental_item_upsells(business_id,source_item_id,sort_order);
alter table public.rental_item_upsells enable row level security;
drop policy if exists "members can view rental upsells" on public.rental_item_upsells;
create policy "members can view rental upsells" on public.rental_item_upsells for select to authenticated using(public.is_business_member(business_id));
drop policy if exists "managers can manage rental upsells" on public.rental_item_upsells;
create policy "managers can manage rental upsells" on public.rental_item_upsells for all to authenticated
using(public.has_business_role(business_id,array['owner','admin','manager']))
with check(public.has_business_role(business_id,array['owner','admin','manager']));
