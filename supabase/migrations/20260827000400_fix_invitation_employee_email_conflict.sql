begin;

create or replace function public.sync_business_member_employee()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_employee_id uuid;
  v_role_id uuid;
  v_name text;
  v_email text;
begin
  perform public.seed_default_workforce_roles(new.business_id);

  select nullif(trim(full_name),''),nullif(lower(trim(email)),'')
  into v_name,v_email
  from public.profiles
  where id=new.user_id;

  if v_email is not null then
    update public.employees
    set auth_user_id=coalesce(auth_user_id,new.user_id),
        preferred_name=coalesce(nullif(trim(preferred_name),''),coalesce(v_name,v_email,'Team member')),
        legal_name=coalesce(legal_name,v_name),
        email=coalesce(email,v_email),
        updated_at=now(),
        updated_by=new.user_id
    where business_id=new.business_id
      and lower(email)=v_email
    returning id into v_employee_id;
  end if;

  if v_employee_id is null then
    insert into public.employees(business_id,auth_user_id,preferred_name,legal_name,email,created_by)
    values(new.business_id,new.user_id,coalesce(v_name,v_email,'Team member'),v_name,v_email,new.user_id)
    on conflict(business_id,auth_user_id) where auth_user_id is not null
    do update set email=coalesce(excluded.email,employees.email),updated_at=now(),updated_by=new.user_id
    returning id into v_employee_id;
  end if;

  select id into v_role_id
  from public.workforce_roles
  where business_id=new.business_id
    and role_key=case new.role when 'owner' then 'owner' when 'manager' then 'manager' else 'office_staff' end;

  update public.employee_role_assignments era
  set is_active=false,effective_through=current_date,ended_at=now(),ended_by=new.user_id
  from public.workforce_roles wr
  where era.business_id=new.business_id
    and era.employee_id=v_employee_id
    and era.is_active
    and wr.business_id=era.business_id
    and wr.id=era.workforce_role_id
    and wr.role_key in ('owner','manager','office_staff')
    and wr.id<>v_role_id;

  insert into public.employee_role_assignments(business_id,employee_id,workforce_role_id,assigned_by)
  values(new.business_id,v_employee_id,v_role_id,new.user_id)
  on conflict do nothing;

  return new;
end $$;

notify pgrst,'reload schema';
commit;
