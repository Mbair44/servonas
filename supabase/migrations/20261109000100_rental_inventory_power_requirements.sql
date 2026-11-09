-- NULL preserves legacy unknown configuration; 0 is an explicit no-power item.
alter table public.inventory_items
 add column if not exists power_outlets_required integer null,
 add column if not exists power_instructions text null;
alter table public.inventory_items drop constraint if exists inventory_items_power_outlets_required_check;
alter table public.inventory_items add constraint inventory_items_power_outlets_required_check check(power_outlets_required is null or power_outlets_required>=0);

alter table public.bookings
 add column if not exists power_outlets_required integer null,
 add column if not exists power_requirements_unconfigured boolean not null default false,
 add column if not exists power_instructions text null,
 add column if not exists power_selection text null,
 add column if not exists generator_coverage_confirmed boolean not null default false;
alter table public.bookings drop constraint if exists bookings_power_selection_check;
alter table public.bookings add constraint bookings_power_selection_check check(power_selection is null or power_selection in ('electricity','generator_request','unsure'));
alter table public.bookings drop constraint if exists bookings_power_outlets_required_check;
alter table public.bookings add constraint bookings_power_outlets_required_check check(power_outlets_required is null or power_outlets_required>=0);

comment on column public.inventory_items.power_outlets_required is 'NULL means legacy/unconfigured; zero explicitly means no electrical outlet is required.';
