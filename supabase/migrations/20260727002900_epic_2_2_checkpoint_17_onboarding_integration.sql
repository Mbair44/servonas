-- Epic 2.2 Checkpoint 17: centralized, derived team-onboarding readiness.
create or replace function public.business_team_onboarding_status(p_business_id uuid)
returns text language plpgsql stable security definer set search_path=public as $$
declare v_owner uuid;v_employees int;v_activated int;v_pending int;v_imports int;
begin
 if not public.is_business_member(p_business_id) then raise exception 'Permission denied' using errcode='42501';end if;
 select owner_user_id into v_owner from public.businesses where id=p_business_id;
 if not found then raise exception 'Business not found' using errcode='P0002';end if;
 select count(*),count(*) filter(where auth_user_id is not null and auth_user_id<>v_owner)
  into v_employees,v_activated from public.employees
  where business_id=p_business_id and is_active and (auth_user_id is null or auth_user_id<>v_owner);
 select count(*) into v_pending from public.business_invitations
  where business_id=p_business_id and accepted_at is null and expires_at>now();
 select count(*) into v_imports from public.employee_imports
  where business_id=p_business_id and status not in('completed','completed_with_errors','failed','canceled','rolled_back');
 return case
  when v_activated>0 then 'team_activated'
  when v_pending>0 then 'invitations_pending'
  when v_employees>0 then 'employees_added'
  when v_imports>0 then 'in_progress'
  else 'not_started' end;
end$$;
revoke all on function public.business_team_onboarding_status(uuid) from public;
grant execute on function public.business_team_onboarding_status(uuid) to authenticated;
comment on function public.business_team_onboarding_status(uuid) is
 'Derived team onboarding state. Employee import remains recommended and never blocks base onboarding completion.';
