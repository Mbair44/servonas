-- Associate the existing rental catalog and reservations with a Servonas workspace.
-- Existing single-business rows remain nullable so deployments can backfill them safely.
alter table public.inventory_items add column if not exists business_id uuid references public.businesses(id) on delete cascade;
alter table public.bookings add column if not exists business_id uuid references public.businesses(id) on delete cascade;
alter table public.blocked_dates add column if not exists business_id uuid references public.businesses(id) on delete cascade;

create index if not exists inventory_items_business_active_idx on public.inventory_items(business_id,active,created_at);
create index if not exists bookings_business_created_idx on public.bookings(business_id,created_at desc);
create index if not exists blocked_dates_business_date_idx on public.blocked_dates(business_id,blocked_date);

alter table public.inventory_items enable row level security;
drop policy if exists "members can view rental inventory" on public.inventory_items;
create policy "members can view rental inventory" on public.inventory_items for select to authenticated using(public.is_business_member(business_id));
drop policy if exists "managers can manage rental inventory" on public.inventory_items;
create policy "managers can manage rental inventory" on public.inventory_items for all to authenticated
using(public.has_business_role(business_id,array['owner','admin','manager']))
with check(public.has_business_role(business_id,array['owner','admin','manager']));

comment on column public.inventory_items.business_id is 'Workspace that owns this customer-facing party-rental catalog item.';
