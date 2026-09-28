begin;
create table public.promotion_buy_get_rules (
 promotion_id uuid primary key references public.promotions(id) on delete cascade,
 qualifying_item_ids uuid[] not null default '{}',
 minimum_qualifying_quantity integer not null default 1 check (minimum_qualifying_quantity > 0),
 reward_item_ids uuid[] not null,
 reward_quantity integer not null check (reward_quantity > 0),
 reward_discount_type text not null check (reward_discount_type in ('percentage','fixed')),
 reward_discount_value integer not null check (reward_discount_value >= 0),
 created_at timestamptz not null default now(),
 check (cardinality(reward_item_ids) > 0),
 check (reward_discount_type <> 'percentage' or reward_discount_value <= 10000)
);
alter table public.promotion_buy_get_rules enable row level security;
create policy "members read buy get rules" on public.promotion_buy_get_rules for select to authenticated using (exists(select 1 from public.promotions p where p.id=promotion_id and public.is_business_member(p.business_id)));
create policy "admins manage buy get rules" on public.promotion_buy_get_rules for all to authenticated using (exists(select 1 from public.promotions p where p.id=promotion_id and public.has_business_role(p.business_id,array['owner','admin']))) with check (exists(select 1 from public.promotions p where p.id=promotion_id and public.has_business_role(p.business_id,array['owner','admin'])));
commit;
