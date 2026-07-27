begin;

-- Checkpoint 5 originally attempted to link employees through a nonexistent
-- employees.user_id column. Technician profiles already carry the normalized
-- employee_id foreign key, so use that source of truth directly.
create or replace function public.sync_employee_territories_to_technician(
  p_business_id uuid,
  p_employee_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_technician_id uuid;
  v_service_areas text[];
begin
  select profile.id into v_technician_id
  from public.technician_profiles profile
  where profile.business_id=p_business_id
    and profile.employee_id=p_employee_id;

  if v_technician_id is null then return; end if;

  select coalesce(array_agg(ranked.name order by ranked.assignment_rank,ranked.name),'{}'::text[])
  into v_service_areas
  from (
    select territory.name,
      min(case assignment.assignment_type
        when 'primary' then 1
        when 'backup' then 2
        when 'secondary' then 3
        else 4
      end) as assignment_rank
    from public.employee_territory_assignments assignment
    join public.workforce_territories territory
      on territory.business_id=assignment.business_id
      and territory.id=assignment.territory_id
      and territory.is_active
    where assignment.business_id=p_business_id
      and assignment.employee_id=p_employee_id
      and assignment.ended_at is null
      and assignment.effective_from<=current_date
      and (assignment.effective_through is null or assignment.effective_through>=current_date)
    group by territory.name
  ) ranked;

  update public.technician_profiles
  set service_areas=v_service_areas,updated_at=now()
  where business_id=p_business_id and id=v_technician_id;
end
$$;
revoke all on function public.sync_employee_territories_to_technician(uuid,uuid) from public;

comment on function public.sync_employee_territories_to_technician(uuid,uuid) is
  'Projects normalized active employee territory coverage into technician_profiles.service_areas using technician_profiles.employee_id.';

commit;
