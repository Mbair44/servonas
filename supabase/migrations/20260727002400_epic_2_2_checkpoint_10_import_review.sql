-- Epic 2.2 Checkpoint 10: authoritative, tenant-safe pre-commit review.
create or replace function public.get_employee_import_review(p_import_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v public.employee_imports;result jsonb;
begin
 select * into v from public.employee_imports where id=p_import_id;
 if not found or not public.has_business_role(v.business_id,array['owner','admin']) then
  raise exception 'Permission denied' using errcode='42501';
 end if;
 select jsonb_build_object(
  'totalRows',count(*),
  'newEmployees',count(*) filter(where not is_ignored and jsonb_array_length(validation_errors)=0 and duplicate_resolution='create'),
  'employeesToUpdate',count(*) filter(where not is_ignored and jsonb_array_length(validation_errors)=0 and duplicate_resolution in('update','merge')),
  'rowsToSkip',count(*) filter(where is_ignored or duplicate_resolution='skip'),
  'warningRows',count(*) filter(where not is_ignored and jsonb_array_length(validation_warnings)>0),
  'errorRows',count(*) filter(where not is_ignored and jsonb_array_length(validation_errors)>0),
  'employeesToInvite',count(*) filter(where not is_ignored and jsonb_array_length(validation_errors)=0 and duplicate_resolution<>'skip' and invite_requested),
  'employeesWithoutAccess',count(*) filter(where not is_ignored and jsonb_array_length(validation_errors)=0 and duplicate_resolution<>'skip' and access_role is null),
  'rolesAssigned',coalesce(jsonb_object_agg(access_role,role_count) filter(where access_role is not null),'{}'::jsonb),
  'elevatedAssignments',coalesce(sum(elevated_count),0),
  'managerAssignments',coalesce(sum(manager_count),0),
  'territoryAssignments',coalesce(sum(territory_count),0),
  'qualificationAssignments',coalesce(sum(qualification_count),0)
 ) into result
 from (
  select r.*,
   count(*) filter(where not r.is_ignored and jsonb_array_length(r.validation_errors)=0 and r.duplicate_resolution<>'skip') over(partition by r.access_role) role_count,
   case when not r.is_ignored and jsonb_array_length(r.validation_errors)=0 and r.duplicate_resolution<>'skip' and r.access_role in('manager','admin') then 1 else 0 end elevated_count,
   case when not r.is_ignored and jsonb_array_length(r.validation_errors)=0 and r.duplicate_resolution<>'skip' and r.manager_employee_id is not null then 1 else 0 end manager_count,
   case when not r.is_ignored and jsonb_array_length(r.validation_errors)=0 and r.duplicate_resolution<>'skip' and r.territory_id is not null then 1 else 0 end territory_count,
   case when not r.is_ignored and jsonb_array_length(r.validation_errors)=0 and r.duplicate_resolution<>'skip' then cardinality(r.qualification_ids) else 0 end qualification_count
  from public.employee_import_rows r where r.business_id=v.business_id and r.import_id=v.id
 ) rows;
 return coalesce(result,'{}'::jsonb);
end$$;
revoke all on function public.get_employee_import_review(uuid) from public;
grant execute on function public.get_employee_import_review(uuid) to authenticated;

create or replace function public.prepare_employee_import_commit(
 p_import_id uuid,p_expected_version integer,p_mode text,p_invitation_mode text
) returns public.employee_imports language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;v_errors int;v_ready int;v_invites int;v_previous_status text;
begin
 select * into v from public.employee_imports where id=p_import_id for update;
 if not found or not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
 if v.status not in('needs_review','ready') then raise exception 'Import is not ready for final review' using errcode='22023';end if;
 if p_mode not in('ready_rows','fix_all') or p_invitation_mode not in('send','without') then raise exception 'Invalid review choice' using errcode='22023';end if;
 select count(*) filter(where not is_ignored and jsonb_array_length(validation_errors)>0),
  count(*) filter(where not is_ignored and jsonb_array_length(validation_errors)=0 and duplicate_resolution<>'skip'),
  count(*) filter(where not is_ignored and jsonb_array_length(validation_errors)=0 and duplicate_resolution<>'skip' and invite_requested)
 into v_errors,v_ready,v_invites from public.employee_import_rows where business_id=v.business_id and import_id=v.id;
 if p_mode='fix_all' and v_errors>0 then raise exception 'Fix blocking errors before importing' using errcode='22023';end if;
 if v_ready=0 then raise exception 'No employee rows are ready to import' using errcode='22023';end if;
 v_previous_status:=v.status;
 update public.employee_imports set status='ready',current_stage='commit',
  import_settings=import_settings||jsonb_build_object('commit_mode',p_mode,'invitation_mode',p_invitation_mode,'reviewed_at',now()),
  version=version+1,last_activity_at=now(),updated_at=now() where id=v.id returning * into v;
 insert into public.employee_import_events(business_id,import_id,event_type,actor_user_id,from_status,to_status,import_version,counts,metadata)
 values(v.business_id,v.id,'commit_review_confirmed',auth.uid(),v_previous_status,v.status,v.version,
  jsonb_build_object('ready',v_ready,'errors',v_errors,'invitations_selected',case when p_invitation_mode='send' then v_invites else 0 end),
  jsonb_build_object('commit_mode',p_mode,'invitation_mode',p_invitation_mode));
 return v;
end$$;
revoke all on function public.prepare_employee_import_commit(uuid,integer,text,text) from public;
grant execute on function public.prepare_employee_import_commit(uuid,integer,text,text) to authenticated;

comment on function public.get_employee_import_review(uuid) is
 'Returns aggregate review facts only; no employee PII is exposed through this function.';
