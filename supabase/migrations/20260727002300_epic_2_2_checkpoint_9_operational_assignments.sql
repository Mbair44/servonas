-- Epic 2.2 Checkpoint 9: optional references to existing workforce domains only.
alter table public.employee_import_rows
 add column manager_employee_id uuid,
 add column territory_id uuid,
 add column qualification_ids uuid[] not null default '{}',
 add column operational_assignment_status text not null default 'unassigned',
 add constraint employee_import_rows_manager_fk foreign key(business_id,manager_employee_id) references public.employees(business_id,id) on delete restrict,
 add constraint employee_import_rows_territory_fk foreign key(business_id,territory_id) references public.workforce_territories(business_id,id) on delete restrict,
 add constraint employee_import_rows_operational_status_check check(operational_assignment_status in('unassigned','resolved','deferred'));

create or replace function public.assign_employee_import_operations(
 p_import_id uuid,p_expected_version integer,p_row_ids uuid[],p_manager_employee_id uuid,
 p_territory_id uuid,p_qualification_ids uuid[],p_defer boolean default false
) returns public.employee_imports language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;v_count int;
begin
 p_row_ids:=coalesce(p_row_ids,'{}'::uuid[]);
 p_qualification_ids:=coalesce(p_qualification_ids,'{}'::uuid[]);
 select * into v from public.employee_imports where id=p_import_id for update;
 if not found or not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
 if p_manager_employee_id is not null and not exists(select 1 from public.employees where id=p_manager_employee_id and business_id=v.business_id and is_active)
 then raise exception 'Manager not found' using errcode='P0002';end if;
 if p_territory_id is not null and not exists(select 1 from public.workforce_territories where id=p_territory_id and business_id=v.business_id and is_active)
 then raise exception 'Territory not found' using errcode='P0002';end if;
 if exists(select 1 from unnest(p_qualification_ids) id where id is null or not exists(select 1 from public.workforce_qualifications q where q.id=id and q.business_id=v.business_id and q.is_active))
 then raise exception 'Skill or qualification not found' using errcode='P0002';end if;
 update public.employee_import_rows set manager_employee_id=case when p_defer then null else p_manager_employee_id end,
  territory_id=case when p_defer then null else p_territory_id end,qualification_ids=case when p_defer then '{}' else p_qualification_ids end,
  operational_assignment_status=case when p_defer then 'deferred' when p_manager_employee_id is null and p_territory_id is null and cardinality(p_qualification_ids)=0 then 'unassigned' else 'resolved' end,
  updated_at=now() where import_id=v.id and business_id=v.business_id and id=any(p_row_ids) and not is_ignored and jsonb_array_length(validation_errors)=0;
 get diagnostics v_count=row_count;
 if v_count<>cardinality(p_row_ids) then raise exception 'One or more selected rows cannot be assigned' using errcode='22023';end if;
 update public.employee_imports set current_stage='roles',version=version+1,last_activity_at=now(),updated_at=now() where id=v.id returning * into v;
 insert into public.employee_import_events(business_id,import_id,event_type,actor_user_id,to_status,import_version,metadata)
 values(v.business_id,v.id,case when p_defer then 'operations_deferred' else 'operations_assigned' end,auth.uid(),v.status,v.version,
 jsonb_build_object('affected_rows',v_count,'manager_assigned',p_manager_employee_id is not null,'territory_assigned',p_territory_id is not null,'qualification_count',cardinality(p_qualification_ids)));
 return v;
end$$;
revoke all on function public.assign_employee_import_operations(uuid,integer,uuid[],uuid,uuid,uuid[],boolean) from public;
grant execute on function public.assign_employee_import_operations(uuid,integer,uuid[],uuid,uuid,uuid[],boolean) to authenticated;
