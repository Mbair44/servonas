-- Epic 2.2 Checkpoint 11: synchronous, row-idempotent employee commit boundary.
alter table public.employee_import_rows
 add column committed_employee_id uuid,
 add column commit_status text not null default 'pending',
 add column commit_error_code text,
 add column committed_at timestamptz,
 add constraint employee_import_rows_committed_employee_fk foreign key(business_id,committed_employee_id) references public.employees(business_id,id) on delete restrict,
 add constraint employee_import_rows_commit_status_check check(commit_status in('pending','imported','updated','skipped','failed')),
 add constraint employee_import_rows_commit_state_check check(
  (commit_status in('imported','updated') and committed_employee_id is not null and committed_at is not null)
  or (commit_status not in('imported','updated'))
 );

create index employee_import_rows_commit_lookup_idx
 on public.employee_import_rows(business_id,import_id,commit_status);

create or replace function public.commit_employee_import(p_import_id uuid,p_expected_version integer)
returns public.employee_imports language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;r public.employee_import_rows;n jsonb;e_id uuid;v_imported int;v_updated int;v_failed int;v_skipped int;
begin
 select * into v from public.employee_imports where id=p_import_id for update;
 if not found or not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if v.status in('completed','completed_with_errors') then return v;end if;
 if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
 if v.status<>'ready' or v.current_stage<>'commit' then raise exception 'Complete the final review before importing' using errcode='22023';end if;
 update public.employee_imports set status='importing',version=version+1,last_activity_at=now(),updated_at=now() where id=v.id returning * into v;
 update public.employee_import_rows set commit_status='skipped',committed_at=coalesce(committed_at,now())
  where business_id=v.business_id and import_id=v.id and commit_status='pending'
   and (is_ignored or duplicate_resolution='skip');
 update public.employee_import_rows set commit_status='failed',commit_error_code='validation_required'
  where business_id=v.business_id and import_id=v.id and commit_status='pending'
   and v.import_settings->>'commit_mode'='ready_rows' and jsonb_array_length(validation_errors)>0;
 for r in select * from public.employee_import_rows where business_id=v.business_id and import_id=v.id and commit_status in('pending','failed')
  and not is_ignored and duplicate_resolution<>'skip' and jsonb_array_length(validation_errors)=0 order by source_row_number
 loop
  begin
   n:=r.normalized_values;
   if r.duplicate_resolution='create' then
    insert into public.employees(business_id,first_name,last_name,preferred_name,legal_name,email,phone,employee_number,job_title,employee_type,employment_status,manager_employee_id,hire_date,notes,is_active,created_by,updated_by)
    values(v.business_id,nullif(n->>'first_name',''),nullif(n->>'last_name',''),
     coalesce(nullif(n->>'preferred_name',''),nullif(btrim(concat_ws(' ',n->>'first_name',n->>'last_name')),'')),
     nullif(btrim(concat_ws(' ',n->>'first_name',n->>'last_name')),''),nullif(lower(n->>'email'),''),nullif(n->>'phone',''),
     nullif(n->>'employee_number',''),nullif(n->>'job_title',''),nullif(n->>'employee_type',''),
     coalesce(nullif(n->>'employment_status',''),'active'),r.manager_employee_id,nullif(n->>'start_date','')::date,
     nullif(n->>'notes',''),coalesce(nullif(n->>'employment_status',''),'active')='active',auth.uid(),auth.uid())
    returning id into e_id;
    update public.employee_import_rows set committed_employee_id=e_id,commit_status='imported',commit_error_code=null,committed_at=now(),updated_at=now() where id=r.id;
   else
    e_id:=r.existing_employee_id;
    if e_id is null then raise exception 'Existing employee is missing' using errcode='P0002';end if;
    update public.employees e set
     first_name=case when (r.duplicate_resolution='update' or 'first_name'=any(r.merge_fields)) and n?'first_name' then coalesce(nullif(n->>'first_name',''),e.first_name) else e.first_name end,
     last_name=case when (r.duplicate_resolution='update' or 'last_name'=any(r.merge_fields)) and n?'last_name' then coalesce(nullif(n->>'last_name',''),e.last_name) else e.last_name end,
     preferred_name=case when (r.duplicate_resolution='update' or 'preferred_name'=any(r.merge_fields)) and n?'preferred_name' then coalesce(nullif(n->>'preferred_name',''),e.preferred_name) else e.preferred_name end,
     email=case when (r.duplicate_resolution='update' or 'email'=any(r.merge_fields)) and n?'email' then coalesce(nullif(lower(n->>'email'),''),e.email) else e.email end,
     phone=case when (r.duplicate_resolution='update' or 'phone'=any(r.merge_fields)) and n?'phone' then coalesce(nullif(n->>'phone',''),e.phone) else e.phone end,
     employee_number=case when (r.duplicate_resolution='update' or 'employee_number'=any(r.merge_fields)) and n?'employee_number' then coalesce(nullif(n->>'employee_number',''),e.employee_number) else e.employee_number end,
     job_title=case when (r.duplicate_resolution='update' or 'job_title'=any(r.merge_fields)) and n?'job_title' then coalesce(nullif(n->>'job_title',''),e.job_title) else e.job_title end,
     employee_type=case when (r.duplicate_resolution='update' or 'employee_type'=any(r.merge_fields)) and n?'employee_type' then coalesce(nullif(n->>'employee_type',''),e.employee_type) else e.employee_type end,
     employment_status=case when (r.duplicate_resolution='update' or 'employment_status'=any(r.merge_fields)) and n?'employment_status' then coalesce(nullif(n->>'employment_status',''),e.employment_status) else e.employment_status end,
     manager_employee_id=coalesce(r.manager_employee_id,e.manager_employee_id),updated_by=auth.uid(),updated_at=now()
    where e.business_id=v.business_id and e.id=e_id;
    if not found then raise exception 'Existing employee is missing' using errcode='P0002';end if;
    insert into public.employee_activation_events(business_id,employee_id,event_type,actor_user_id,metadata)
     values(v.business_id,e_id,'employee_updated',auth.uid(),jsonb_build_object('source','employee_import'));
    update public.employee_import_rows set committed_employee_id=e_id,commit_status='updated',commit_error_code=null,committed_at=now(),updated_at=now() where id=r.id;
   end if;
   if r.workforce_role_id is not null then
    insert into public.employee_role_assignments(business_id,employee_id,workforce_role_id,assigned_by)
     values(v.business_id,e_id,r.workforce_role_id,auth.uid()) on conflict do nothing;
   end if;
   if r.territory_id is not null then
    -- Import never displaces the territory's current primary employee.
    insert into public.employee_territory_assignments(business_id,employee_id,territory_id,assignment_type,created_by)
     values(v.business_id,e_id,r.territory_id,'secondary',auth.uid()) on conflict do nothing;
   end if;
   insert into public.employee_qualifications(business_id,employee_id,qualification_id,assigned_by)
    select v.business_id,e_id,q,auth.uid() from unnest(r.qualification_ids)q on conflict do nothing;
  exception when others then
   update public.employee_import_rows set commit_status='failed',commit_error_code=case sqlstate when '23505' then 'duplicate_employee' when '23503' then 'reference_unavailable' when '23514' then 'invalid_employee_data' else 'commit_failed' end,updated_at=now() where id=r.id;
  end;
 end loop;
 select count(*)filter(where commit_status='imported'),count(*)filter(where commit_status='updated'),count(*)filter(where commit_status='failed'),count(*)filter(where commit_status='skipped')
 into v_imported,v_updated,v_failed,v_skipped from public.employee_import_rows where business_id=v.business_id and import_id=v.id;
 update public.employee_imports set status=case when v_failed>0 then 'completed_with_errors' else 'completed' end,current_stage='invite',
  imported_row_count=v_imported+v_updated,failed_row_count=v_failed,completed_at=now(),
  metadata=metadata||jsonb_build_object('updated_row_count',v_updated,'skipped_row_count',v_skipped),
  rollback_status=case when v_imported>0 then 'eligible' else 'not_requested' end,version=version+1,last_activity_at=now(),updated_at=now()
 where id=v.id returning * into v;
 insert into public.employee_import_events(business_id,import_id,event_type,actor_user_id,from_status,to_status,import_version,counts,metadata)
 values(v.business_id,v.id,'import_committed',auth.uid(),'importing',v.status,v.version,
  jsonb_build_object('imported',v_imported,'updated',v_updated,'failed',v_failed,'skipped',v_skipped),
  jsonb_build_object('row_transactions',true,'invitations_sent',0));
 return v;
end$$;
revoke all on function public.commit_employee_import(uuid,integer) from public;
grant execute on function public.commit_employee_import(uuid,integer) to authenticated;

comment on function public.commit_employee_import(uuid,integer) is
 'Idempotent per-row employee commit. Successful rows are never repeated; invitation delivery is a separate checkpoint.';
