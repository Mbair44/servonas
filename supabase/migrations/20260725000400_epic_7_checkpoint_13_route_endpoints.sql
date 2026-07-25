begin;

create table public.business_route_endpoint_defaults (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  start_mode text not null default 'first_job',
  end_mode text not null default 'last_job',
  office_label text not null default 'Main office',
  office_address text,
  office_latitude numeric(10,7),
  office_longitude numeric(10,7),
  custom_start_label text,
  custom_start_address text,
  custom_start_latitude numeric(10,7),
  custom_start_longitude numeric(10,7),
  custom_end_label text,
  custom_end_address text,
  custom_end_latitude numeric(10,7),
  custom_end_longitude numeric(10,7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint business_route_start_mode_check check(start_mode in ('office','custom','first_job','none')),
  constraint business_route_end_mode_check check(end_mode in ('office','custom','last_job','none')),
  constraint business_route_office_coordinates_check check((office_latitude is null)=(office_longitude is null)),
  constraint business_route_custom_start_coordinates_check check((custom_start_latitude is null)=(custom_start_longitude is null)),
  constraint business_route_custom_end_coordinates_check check((custom_end_latitude is null)=(custom_end_longitude is null))
);

create table public.technician_route_endpoint_overrides (
  business_id uuid not null,
  technician_id uuid not null,
  start_mode text not null default 'inherit',
  end_mode text not null default 'inherit',
  home_label text not null default 'Technician home',
  home_address text,
  home_latitude numeric(10,7),
  home_longitude numeric(10,7),
  custom_start_label text,
  custom_start_address text,
  custom_start_latitude numeric(10,7),
  custom_start_longitude numeric(10,7),
  custom_end_label text,
  custom_end_address text,
  custom_end_latitude numeric(10,7),
  custom_end_longitude numeric(10,7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key(business_id,technician_id),
  foreign key(business_id,technician_id) references public.technician_profiles(business_id,id) on delete cascade,
  constraint technician_route_start_mode_check check(start_mode in ('inherit','office','home','custom','first_job','none')),
  constraint technician_route_end_mode_check check(end_mode in ('inherit','office','home','custom','last_job','none')),
  constraint technician_route_home_coordinates_check check((home_latitude is null)=(home_longitude is null)),
  constraint technician_route_custom_start_coordinates_check check((custom_start_latitude is null)=(custom_start_longitude is null)),
  constraint technician_route_custom_end_coordinates_check check((custom_end_latitude is null)=(custom_end_longitude is null))
);

comment on table public.technician_route_endpoint_overrides is
  'Sensitive route endpoint configuration. Home address and coordinates are owner/admin/service-role only and must never be selected by general route queries.';
comment on column public.technician_route_endpoint_overrides.home_label is
  'Non-sensitive display label stored separately from the private home address.';

alter table public.business_route_endpoint_defaults enable row level security;
alter table public.technician_route_endpoint_overrides enable row level security;
create policy "owners manage route endpoint defaults" on public.business_route_endpoint_defaults
  for all to authenticated using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "owners manage private technician endpoints" on public.technician_route_endpoint_overrides
  for all to authenticated using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));

create trigger business_route_endpoint_defaults_updated_at before update on public.business_route_endpoint_defaults
for each row execute function public.set_routing_updated_at();
create trigger technician_route_endpoint_overrides_updated_at before update on public.technician_route_endpoint_overrides
for each row execute function public.set_routing_updated_at();

create or replace function public.mark_endpoint_route_plans_stale()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_business_id uuid;
begin
  v_business_id=case when tg_op='DELETE' then old.business_id else new.business_id end;
  update public.route_plans set calculation_status='stale',stale_at=now(),version=version+1,updated_at=now()
  where business_id=v_business_id and status<>'archived';
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.mark_endpoint_route_plans_stale() from public;
create trigger business_route_endpoints_stale after insert or update or delete on public.business_route_endpoint_defaults
for each row execute function public.mark_endpoint_route_plans_stale();
create trigger technician_route_endpoints_stale after insert or update or delete on public.technician_route_endpoint_overrides
for each row execute function public.mark_endpoint_route_plans_stale();

commit;
