-- Internal acquisition records for party-rental inventory.
alter table public.inventory_items
  add column if not exists purchase_cost_cents integer,
  add column if not exists purchase_receipt_path text,
  add column if not exists purchase_receipt_name text;

alter table public.inventory_items
  drop constraint if exists inventory_items_purchase_cost_check;
alter table public.inventory_items
  add constraint inventory_items_purchase_cost_check
  check (purchase_cost_cents is null or purchase_cost_cents >= 0);

comment on column public.inventory_items.purchase_cost_cents is 'Internal acquisition cost; never exposed in the public rental catalog.';
comment on column public.inventory_items.purchase_receipt_path is 'Private storage path for the purchase receipt.';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rental-purchase-receipts','rental-purchase-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
