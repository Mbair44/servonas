-- Epic 8, Checkpoint 1: first-class tenant workforce identities and roles.
begin;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  employee_number text,
  preferred_name text not null,
  legal_name text,
  email text,
  phone text,
  profile_photo_url text,
  hire_date date,
  termination_date date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint employees_name_check check(length(trim(preferred_name)) between 1 and 200),
  constraint employees_email_check check(email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  constraint employees_photo_check check(profile_photo_url is null or profile_photo_url ~* '^https://'),
  constraint employees_dates_check check(termination_date is null or hire_date is null or termination_date>=hire_date),
  constraint employees_termination_state_check check(termination_date is null or is_active=false)
);
create unique index employees_business_id_id_unique on public.employees(business_id,id);
create unique index employees_business_auth_user_unique on public.employees(business_id,auth_user_id)
  where auth_user_id is not null;
create unique index employees_business_number_unique on public.employees(business_id,lower(employee_number))
  where employee_number is not null;
create unique index employees_business_email_unique on public.employees(business_id,lower(email))
  where email is not null;
create index employees_business_directory_idx on public.employees(business_id,is_active,preferred_name);

create table public.workforce_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  role_key text,
  description text,
  is_system_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint workforce_roles_name_check check(length(trim(name)) between 1 and 100),
  constraint workforce_roles_key_check check(role_key is null or role_key ~ '^[a-z][a-z0-9_]{1,49}$')
);
create unique index workforce_roles_business_id_id_unique on public.workforce_roles(business_id,id);
create unique index workforce_roles_business_name_unique on public.workforce_roles(business_id,lower(name));
create unique index workforce_roles_business_key_unique on public.workforce_roles(business_id,role_key)
  where role_key is not null;

create table public.employee_role_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  employee_id uuid not null,
  workforce_role_id uuid not null,
  effective_from date not null default current_date,
  effective_through date,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  constraint employee_roles_employee_tenant_fk foreign key(business_id,employee_id)
    references public.employees(business_id,id) on delete cascade,
  constraint employee_roles_role_tenant_fk foreign key(business_id,workforce_role_id)
    references public.workforce_roles(business_id,id) on delete cascade,
  constraint employee_roles_dates_check check(effective_through is null or effective_through>=effective_from),
  constraint employee_roles_state_check check(
    (is_active and ended_at is null and effective_through is null)
    or (not is_active and ended_at is not null)
  )
);
create unique index employee_roles_one_active_unique
  on public.employee_role_assignments(business_id,employee_id,workforce_role_id) where is_active;
create index employee_roles_employee_history_idx
  on public.employee_role_assignments(business_id,employee_id,effective_from desc);
create index employee_roles_role_active_idx
  on public.employee_role_assignments(business_id,workforce_role_id,is_active);

alter table public.technician_profiles add column employee_id uuid;
alter table public.technician_profiles add constraint technician_profiles_employee_tenant_fk
  foreign key(business_id,employee_id) references public.employees(business_id,id);
create unique index technician_profiles_employee_unique on public.technician_profiles(business_id,employee_id)
  where employee_id is not null;

alter table public.employees enable row level security;
alter table public.workforce_roles enable row level security;
alter table public.employee_role_assignments enable row level security;
create policy "office reads employees" on public.employees for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer employees" on public.employees for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "office reads workforce roles" on public.workforce_roles for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer workforce roles" on public.workforce_roles for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));
create policy "office reads employee role history" on public.employee_role_assignments for select to authenticated
  using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer employee roles" on public.employee_role_assignments for all to authenticated
  using(public.has_business_role(business_id,array['owner','admin']))
  with check(public.has_business_role(business_id,array['owner','admin']));

create trigger employees_updated_at before update on public.employees
for each row execute function public.set_routing_updated_at();
create trigger workforce_roles_updated_at before update on public.workforce_roles
for each row execute function public.set_routing_updated_at();

create or replace function public.seed_default_workforce_roles(p_business_id uuid)
returns void language sql security definer set search_path=public as $$
  insert into public.workforce_roles(business_id,name,role_key,is_system_default)
  select p_business_id,v.name,v.role_key,true
  from (values
    ('Technician','technician'),('Installer','installer'),('Driver','driver'),
    ('Crew Member','crew_member'),('Sales','sales'),('Office Staff','office_staff'),
    ('Dispatcher','dispatcher'),('Manager','manager'),('Owner','owner')
  ) as v(name,role_key)
  on conflict do nothing;
$$;
revoke all on function public.seed_default_workforce_roles(uuid) from public;
grant execute on function public.seed_default_workforce_roles(uuid) to service_role;

insert into public.workforce_roles(business_id,name,role_key,is_system_default)
select b.id,v.name,v.role_key,true
from public.businesses b
cross join (values
  ('Technician','technician'),('Installer','installer'),('Driver','driver'),
  ('Crew Member','crew_member'),('Sales','sales'),('Office Staff','office_staff'),
  ('Dispatcher','dispatcher'),('Manager','manager'),('Owner','owner')
) as v(name,role_key)
on conflict do nothing;

create or replace function public.initialize_business_workforce_roles()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.seed_default_workforce_roles(new.id);
  return new;
end $$;
create trigger businesses_initialize_workforce_roles after insert on public.businesses
for each row execute function public.initialize_business_workforce_roles();

insert into public.employees(business_id,auth_user_id,preferred_name,legal_name,email,is_active)
select bm.business_id,bm.user_id,
  coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Team member'),
  nullif(trim(p.full_name),''),
  nullif(lower(trim(p.email)),''),
  true
from public.business_members bm
left join public.profiles p on p.id=bm.user_id
on conflict do nothing;

update public.technician_profiles tp
set employee_id=e.id
from public.employees e
where e.business_id=tp.business_id and e.auth_user_id=tp.member_user_id and tp.employee_id is null;

insert into public.employee_role_assignments(business_id,employee_id,workforce_role_id,assigned_by)
select e.business_id,e.id,wr.id,bm.user_id
from public.employees e
join public.business_members bm on bm.business_id=e.business_id and bm.user_id=e.auth_user_id
join public.workforce_roles wr on wr.business_id=e.business_id
  and wr.role_key=case bm.role when 'owner' then 'owner' when 'manager' then 'manager' else 'office_staff' end
on conflict do nothing;

create or replace function public.sync_business_member_employee()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_employee_id uuid; v_role_id uuid; v_name text; v_email text;
begin
  perform public.seed_default_workforce_roles(new.business_id);
  select nullif(trim(full_name),''),nullif(lower(trim(email)),'') into v_name,v_email
  from public.profiles where id=new.user_id;
  insert into public.employees(business_id,auth_user_id,preferred_name,legal_name,email,created_by)
  values(new.business_id,new.user_id,coalesce(v_name,v_email,'Team member'),v_name,v_email,new.user_id)
  on conflict(business_id,auth_user_id) where auth_user_id is not null
  do update set email=coalesce(excluded.email,employees.email),updated_at=now()
  returning id into v_employee_id;
  select id into v_role_id from public.workforce_roles
  where business_id=new.business_id
    and role_key=case new.role when 'owner' then 'owner' when 'manager' then 'manager' else 'office_staff' end;
  update public.employee_role_assignments era
  set is_active=false,effective_through=current_date,ended_at=now(),ended_by=new.user_id
  from public.workforce_roles wr
  where era.business_id=new.business_id and era.employee_id=v_employee_id and era.is_active
    and wr.business_id=era.business_id and wr.id=era.workforce_role_id
    and wr.role_key in ('owner','manager','office_staff') and wr.id<>v_role_id;
  insert into public.employee_role_assignments(business_id,employee_id,workforce_role_id,assigned_by)
  values(new.business_id,v_employee_id,v_role_id,new.user_id) on conflict do nothing;
  return new;
end $$;
create trigger business_members_sync_employee after insert or update of role on public.business_members
for each row execute function public.sync_business_member_employee();
insert into public.employee_role_assignments(business_id,employee_id,workforce_role_id,assigned_by)
select e.business_id,e.id,wr.id,tp.member_user_id
from public.technician_profiles tp
join public.employees e on e.business_id=tp.business_id and e.id=tp.employee_id
join public.workforce_roles wr on wr.business_id=e.business_id and wr.role_key='technician'
where tp.is_technician
on conflict do nothing;

comment on table public.employees is
  'Tenant-owned workforce identity. Authentication membership and technician operational capability remain separate optional relationships.';
comment on table public.employee_role_assignments is
  'Effective-dated simultaneous workforce roles. Rows are ended rather than rewritten to preserve workforce history.';
comment on column public.employees.profile_photo_url is
  'Optional HTTPS photo reference. A tenant-scoped storage workflow may replace this without changing the employee domain.';

commit;
