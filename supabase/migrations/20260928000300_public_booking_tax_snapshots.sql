-- Additive only: existing booking financial values are never recalculated.
begin;
alter table public.inventory_items add column if not exists is_taxable boolean;
alter table public.inventory_items add column if not exists tax_code text;
comment on column public.inventory_items.is_taxable is 'Null inherits business default taxable setting for new quotes; false explicitly excludes rental charges.';
alter table public.bookings add column if not exists tax_snapshot jsonb;
alter table public.bookings add column if not exists taxable_subtotal_cents bigint;
alter table public.booking_items add column if not exists tax_snapshot jsonb;

-- Legacy anonymous reservation functions must not bypass the server tax calculation.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('create_public_booking','create_public_booking_quantities','create_public_booking_quantities_timed')
 loop
  execute format('revoke execute on function %s from public, anon, authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

create or replace function public.protect_booking_tax_snapshot() returns trigger
language plpgsql set search_path=public as $$
begin
 if old.tax_snapshot is not null and new.tax_snapshot is distinct from old.tax_snapshot then
  raise exception 'Booked tax snapshots cannot be replaced';
 end if;
 return new;
end $$;
create trigger bookings_preserve_tax_snapshot before update of tax_snapshot on public.bookings
for each row execute function public.protect_booking_tax_snapshot();
create trigger booking_items_preserve_tax_snapshot before update of tax_snapshot on public.booking_items
for each row execute function public.protect_booking_tax_snapshot();
commit;
