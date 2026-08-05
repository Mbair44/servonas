alter table public.inventory_items add column if not exists category text;
alter table public.inventory_items drop constraint if exists inventory_items_category_length;
alter table public.inventory_items add constraint inventory_items_category_length check(category is null or char_length(btrim(category)) between 1 and 80);
create index if not exists inventory_items_business_category_idx on public.inventory_items(business_id,category) where active=true;
