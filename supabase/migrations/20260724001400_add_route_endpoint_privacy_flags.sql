-- Checkpoint 6 compatibility repair for routing tables installed before
-- private technician endpoint protection was added.

alter table public.technician_routes
  add column if not exists origin_is_private boolean,
  add column if not exists destination_is_private boolean;

update public.technician_routes
set origin_is_private=coalesce(origin_is_private,false),
    destination_is_private=coalesce(destination_is_private,false)
where origin_is_private is null
   or destination_is_private is null;

alter table public.technician_routes
  alter column origin_is_private set default false,
  alter column origin_is_private set not null,
  alter column destination_is_private set default false,
  alter column destination_is_private set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.technician_routes'::regclass
      and conname='technician_routes_private_origin_check'
  ) then
    alter table public.technician_routes
      add constraint technician_routes_private_origin_check check (
        not origin_is_private
        or (
          origin_address_snapshot is null
          and origin_latitude is null
          and origin_longitude is null
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.technician_routes'::regclass
      and conname='technician_routes_private_destination_check'
  ) then
    alter table public.technician_routes
      add constraint technician_routes_private_destination_check check (
        not destination_is_private
        or (
          destination_address_snapshot is null
          and destination_latitude is null
          and destination_longitude is null
        )
      );
  end if;
end
$$;

comment on column public.technician_routes.origin_is_private is
  'When true, general route reads must not store or expose the technician private starting address or coordinates.';
comment on column public.technician_routes.destination_is_private is
  'When true, general route reads must not store or expose the technician private ending address or coordinates.';

notify pgrst,'reload schema';
