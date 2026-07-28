-- Epic 2.2 Checkpoint 14: safely reopen only failed rows for correction.
create or replace function public.reopen_failed_employee_import_rows(
  p_import_id uuid,p_expected_version integer,p_row_ids uuid[] default null
) returns public.employee_imports
language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;v_count integer;v_invalid integer;
begin
  select * into v from public.employee_imports where id=p_import_id for update;
  if not found or not public.has_business_role(v.business_id,array['owner','admin']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
  if v.status<>'completed_with_errors' then raise exception 'This import has no failed rows to reopen' using errcode='22023';end if;
  update public.employee_import_rows set
    commit_status='pending',
    validation_status=case when jsonb_array_length(validation_errors)>0 then 'error' else 'warning' end,
    validation_warnings=case when jsonb_array_length(validation_errors)>0 then validation_warnings
      else validation_warnings||jsonb_build_array(case commit_error_code
        when 'duplicate_employee' then 'This email or employee ID is already used in this business.'
        when 'reference_unavailable' then 'A selected role or assignment is no longer available.'
        when 'invalid_employee_data' then 'Review the employee values and correct the highlighted information.'
        else 'This row could not be imported. Review it before retrying.'
      end) end,
    updated_at=now()
  where business_id=v.business_id and import_id=v.id and commit_status='failed'
    and (p_row_ids is null or id=any(p_row_ids));
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'No failed rows were selected' using errcode='P0002';end if;
  select count(*) into v_invalid from public.employee_import_rows
    where business_id=v.business_id and import_id=v.id and commit_status='pending'
      and jsonb_array_length(validation_errors)>0;
  update public.employee_imports set status='needs_review',current_stage='review',
    failed_row_count=0,invalid_row_count=v_invalid,completed_at=null,
    version=version+1,last_activity_at=now(),updated_at=now()
  where id=v.id returning * into v;
  insert into public.employee_import_events(
    business_id,import_id,event_type,actor_user_id,from_status,to_status,import_version,counts,metadata
  ) values(v.business_id,v.id,'failed_rows_reopened',auth.uid(),'completed_with_errors',v.status,v.version,
    jsonb_build_object('reopened',v_count),jsonb_build_object('successful_rows_preserved',true));
  return v;
end$$;
revoke all on function public.reopen_failed_employee_import_rows(uuid,integer,uuid[]) from public;
grant execute on function public.reopen_failed_employee_import_rows(uuid,integer,uuid[]) to authenticated;
