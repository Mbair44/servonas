alter table public.inventory_items
  add column if not exists length_ft numeric(8,2),
  add column if not exists width_ft numeric(8,2),
  add column if not exists height_ft numeric(8,2);

alter table public.inventory_items
  drop constraint if exists inventory_items_dimensions_check;

alter table public.inventory_items
  add constraint inventory_items_dimensions_check
  check (
    (length_ft is null or length_ft > 0) and
    (width_ft is null or width_ft > 0) and
    (height_ft is null or height_ft > 0)
  );

comment on column public.inventory_items.length_ft is 'Optional rental item length in feet for public catalog display.';
comment on column public.inventory_items.width_ft is 'Optional rental item width in feet for public catalog display.';
comment on column public.inventory_items.height_ft is 'Optional rental item height in feet for public catalog display.';
