begin;

create table public.workforce_territories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  name text not null,
  description text,
  territory_type text not null default 'mixed',
  postal_codes text[] not null default '{}',
  neighborhoods text[] not null default '{}',
  boundary_geojson jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workforce_territories_business_fk foreign key(business_id)
    references public.businesses(id) on delete cascade,
  constraint workforce_territories_tenant_unique unique(business_id,id),
  constraint workforce_territories_name_unique unique(business_id,name),
  constraint workforce_territories_type_check check(territory_type in ('postal_codes','neighborhoods','polygon','mixed')),
  constraint workforce_territories_name_check check(length(btrim(name)) between 1 and 150),
  constraint workforce_territories_description_check check(description is null or length(description)<=2000),
  constraint workforce_territories_boundary_check check(
    boundary_geojson is null or (
      jsonb_typeof(boundary_geojson)='object'
      and boundary_geojson->>'type' in ('Polygon','MultiPolygon')
      and jsonb_typeof(boundary_geojson->'coordinates')='array'
    )
  )
);

create index workforce_territories_lookup_idx
  on public.workforce_territories(business_id,is_active,name);
create index workforce_territories_postal_codes_idx
  on public.workforce_territories using gin(postal_codes);
create index workforce_territories_neighborhoods_idx
  on public.workforce_territories using gin(neighborhoods);

create table public.employee_territory_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  employee_id uuid not null,
  territory_id uuid not null,
  assignment_type text not null,
  effective_from date not null default current_date,
  effective_through date,
  notes text,
  created_by uuid references auth.users(id),
  ended_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint employee_territories_employee_fk foreign key(business_id,employee_id)
    references public.employees(business_id,id) on delete cascade,
  constraint employee_territories_territory_fk foreign key(business_id,territory_id)
    references public.workforce_territories(business_id,id) on delete cascade,
  constraint employee_territories_type_check check(assignment_type in ('primary','secondary','temporary')),
  constraint employee_territories_dates_check check(effective_through is null or effective_through>=effective_from),
  constraint employee_territories_temporary_end_check check(assignment_type<>'temporary' or effective_through is not null),
  constraint employee_territories_notes_check check(notes is null or length(notes)<=1000)
);

create unique index employee_territories_one_current_primary
  on public.employee_territory_assignments(business_id,employee_id)
  where assignment_type='primary' and ended_at is null and effective_through is null;
create unique index employee_territories_no_duplicate_active
  on public.employee_territory_assignments(business_id,employee_id,territory_id,assignment_type)
  where ended_at is null;
create index employee_territories_effective_lookup
  on public.employee_territory_assignments(
    business_id,employee_id,effective_from,effective_through
  ) where ended_at is null;

alter table public.workforce_territories enable row level security;
alter table public.employee_territory_assignments enable row level security;

create policy "office reads workforce territories" on public.workforce_territories
  for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer workforce territories" on public.workforce_territories
  for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "employees read own territories" on public.workforce_territories
  for select to authenticated using(exists(
    select 1 from public.employees employee
    where employee.business_id=workforce_territories.business_id
      and employee.auth_user_id=auth.uid()
  ));

create policy "office reads employee territories" on public.employee_territory_assignments
  for select to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer employee territories" on public.employee_territory_assignments
  for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "employees read own territory assignments" on public.employee_territory_assignments
  for select to authenticated using(exists(
    select 1 from public.employees employee
    where employee.business_id=employee_territory_assignments.business_id
      and employee.id=employee_territory_assignments.employee_id
      and employee.auth_user_id=auth.uid()
  ));

create trigger workforce_territories_updated_at before update on public.workforce_territories
for each row execute function public.set_routing_updated_at();

create or replace function public.sync_employee_territories_to_technician(
  p_business_id uuid,p_employee_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  update public.technician_profiles profile set service_areas=coalesce((
    select array_agg(territory.name order by
      case assignment.assignment_type when 'primary' then 0 when 'secondary' then 1 else 2 end,
      territory.name
    )
    from public.employee_territory_assignments assignment
    join public.workforce_territories territory
      on territory.business_id=assignment.business_id and territory.id=assignment.territory_id
    where assignment.business_id=p_business_id
      and assignment.employee_id=p_employee_id
      and assignment.ended_at is null
      and assignment.effective_from<=current_date
      and (assignment.effective_through is null or assignment.effective_through>=current_date)
      and territory.is_active
  ),'{}'::text[]),updated_at=now()
  where profile.business_id=p_business_id and profile.employee_id=p_employee_id;
end $$;
revoke all on function public.sync_employee_territories_to_technician(uuid,uuid) from public;

create or replace function public.employee_territory_sync_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.sync_employee_territories_to_technician(
    coalesce(new.business_id,old.business_id),coalesce(new.employee_id,old.employee_id)
  );
  return coalesce(new,old);
end $$;
create trigger employee_territories_sync_technician
after insert or update or delete on public.employee_territory_assignments
for each row execute function public.employee_territory_sync_trigger();
revoke all on function public.employee_territory_sync_trigger() from public;

comment on table public.workforce_territories is
  'Tenant-defined geographic operating areas. Polygon coordinates are GeoJSON longitude/latitude pairs; ZIP and neighborhood lists support progressive setup.';
comment on table public.employee_territory_assignments is
  'Effective-dated primary, secondary, and temporary employee territory coverage for dispatch and future optimization.';
comment on column public.workforce_territories.boundary_geojson is
  'Optional GeoJSON Polygon or MultiPolygon. This is operational geometry, never a technician home location.';

commit;
