-- Epic 8, Checkpoint 3: extensible workforce skills and credentials.
begin;

create table public.workforce_qualifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  qualification_type text not null,
  name text not null,
  description text,
  expiration_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint workforce_qualifications_type_check
    check(qualification_type in ('skill','certification','license')),
  constraint workforce_qualifications_name_check check(length(trim(name)) between 1 and 150)
);
create unique index workforce_qualifications_business_id_id_unique
  on public.workforce_qualifications(business_id,id);
create unique index workforce_qualifications_business_name_unique
  on public.workforce_qualifications(business_id,qualification_type,lower(name));
create index workforce_qualifications_directory_idx
  on public.workforce_qualifications(business_id,is_active,qualification_type,name);

create table public.employee_qualifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  employee_id uuid not null,
  qualification_id uuid not null,
  proficiency_level text,
  credential_number text,
  issuing_authority text,
  issued_on date,
  expires_on date,
  status text not null default 'active',
  notes text,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_qualifications_employee_tenant_fk
    foreign key(business_id,employee_id) references public.employees(business_id,id) on delete cascade,
  constraint employee_qualifications_definition_tenant_fk
    foreign key(business_id,qualification_id) references public.workforce_qualifications(business_id,id) on delete restrict,
  constraint employee_qualifications_status_check check(status in ('active','expired','revoked','superseded')),
  constraint employee_qualifications_dates_check check(expires_on is null or issued_on is null or expires_on>=issued_on),
  constraint employee_qualifications_end_state_check check(
    (status='active' and ended_at is null)
    or (status<>'active' and ended_at is not null)
  ),
  constraint employee_qualifications_notes_check check(notes is null or length(notes)<=2000)
);
create unique index employee_qualifications_one_active_unique
  on public.employee_qualifications(business_id,employee_id,qualification_id)
  where status='active';
create index employee_qualifications_employee_history_idx
  on public.employee_qualifications(business_id,employee_id,assigned_at desc);
create index employee_qualifications_expiration_idx
  on public.employee_qualifications(business_id,expires_on)
  where status='active' and expires_on is not null;

alter table public.workforce_qualifications enable row level security;
alter table public.employee_qualifications enable row level security;

create policy "office reads workforce qualifications"
on public.workforce_qualifications for select to authenticated
using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer workforce qualifications"
on public.workforce_qualifications for all to authenticated
using(public.has_business_role(business_id,array['owner','admin']))
with check(public.has_business_role(business_id,array['owner','admin']));
create policy "employees read tenant qualification definitions"
on public.workforce_qualifications for select to authenticated
using(exists(
  select 1 from public.employees employee
  where employee.business_id=workforce_qualifications.business_id
    and employee.auth_user_id=auth.uid()
));

create policy "office reads employee qualifications"
on public.employee_qualifications for select to authenticated
using(public.has_business_role(business_id,array['owner','admin','manager']));
create policy "owners administer employee qualifications"
on public.employee_qualifications for all to authenticated
using(public.has_business_role(business_id,array['owner','admin']))
with check(public.has_business_role(business_id,array['owner','admin']));
create policy "employees read own qualifications"
on public.employee_qualifications for select to authenticated
using(exists(
  select 1 from public.employees employee
  where employee.business_id=employee_qualifications.business_id
    and employee.id=employee_qualifications.employee_id
    and employee.auth_user_id=auth.uid()
));

create trigger workforce_qualifications_updated_at before update
on public.workforce_qualifications for each row execute function public.set_routing_updated_at();
create trigger employee_qualifications_updated_at before update
on public.employee_qualifications for each row execute function public.set_routing_updated_at();

create or replace function public.sync_employee_qualifications_to_technician(
  p_business_id uuid,p_employee_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare v_skills text[];
begin
  select coalesce(array_agg(definition.name order by definition.name),'{}'::text[])
  into v_skills
  from public.employee_qualifications assignment
  join public.workforce_qualifications definition
    on definition.business_id=assignment.business_id
   and definition.id=assignment.qualification_id
  where assignment.business_id=p_business_id
    and assignment.employee_id=p_employee_id
    and assignment.status='active'
    and definition.is_active
    and (assignment.expires_on is null or assignment.expires_on>=current_date);

  update public.technician_profiles
  set skills=v_skills,updated_at=now()
  where business_id=p_business_id and employee_id=p_employee_id;
end $$;
revoke all on function public.sync_employee_qualifications_to_technician(uuid,uuid) from public;

create or replace function public.employee_qualification_sync_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.sync_employee_qualifications_to_technician(
    coalesce(new.business_id,old.business_id),
    coalesce(new.employee_id,old.employee_id)
  );
  return coalesce(new,old);
end $$;
create trigger employee_qualifications_sync_technician
after insert or update or delete on public.employee_qualifications
for each row execute function public.employee_qualification_sync_trigger();
revoke all on function public.employee_qualification_sync_trigger() from public;

create or replace function public.assign_employee_qualification(
  p_business_id uuid,
  p_employee_id uuid,
  p_qualification_type text,
  p_name text,
  p_proficiency_level text,
  p_credential_number text,
  p_issuing_authority text,
  p_issued_on date,
  p_expires_on date,
  p_notes text
) returns uuid
language plpgsql security invoker set search_path=public as $$
declare v_qualification_id uuid; v_assignment_id uuid; v_requires_expiration boolean;
begin
  insert into public.workforce_qualifications(
    business_id,qualification_type,name,created_by,updated_by
  ) values(
    p_business_id,p_qualification_type,trim(p_name),auth.uid(),auth.uid()
  )
  on conflict(business_id,qualification_type,(lower(name))) do update
  set is_active=true,updated_by=auth.uid()
  returning id,expiration_required into v_qualification_id,v_requires_expiration;

  if v_requires_expiration and p_expires_on is null then
    raise exception 'This credential requires an expiration date' using errcode='23514';
  end if;

  insert into public.employee_qualifications(
    business_id,employee_id,qualification_id,proficiency_level,
    credential_number,issuing_authority,issued_on,expires_on,notes,
    assigned_by
  ) values(
    p_business_id,p_employee_id,v_qualification_id,nullif(trim(p_proficiency_level),''),
    nullif(trim(p_credential_number),''),nullif(trim(p_issuing_authority),''),
    p_issued_on,p_expires_on,nullif(trim(p_notes),''),auth.uid()
  )
  returning id into v_assignment_id;
  return v_assignment_id;
end $$;
revoke all on function public.assign_employee_qualification(
  uuid,uuid,text,text,text,text,text,date,date,text
) from public;
grant execute on function public.assign_employee_qualification(
  uuid,uuid,text,text,text,text,text,date,date,text
) to authenticated;

-- Preserve existing technician skill labels as tenant-owned definitions.
insert into public.workforce_qualifications(
  business_id,qualification_type,name,created_by,updated_by
)
select distinct tp.business_id,'skill',trim(skill),tp.created_by,tp.updated_by
from public.technician_profiles tp
cross join lateral unnest(tp.skills) skill
where trim(skill)<>''
on conflict do nothing;

insert into public.employee_qualifications(
  business_id,employee_id,qualification_id,assigned_by
)
select tp.business_id,tp.employee_id,definition.id,tp.updated_by
from public.technician_profiles tp
cross join lateral unnest(tp.skills) skill
join public.workforce_qualifications definition
  on definition.business_id=tp.business_id
 and definition.qualification_type='skill'
 and lower(definition.name)=lower(trim(skill))
where tp.employee_id is not null and trim(skill)<>''
on conflict do nothing;

comment on table public.workforce_qualifications is
  'Tenant-defined skill, certification, and license catalog. Values are operating-model neutral.';
comment on table public.employee_qualifications is
  'Historical employee qualification assignments. End or supersede rows instead of deleting them.';

commit;
