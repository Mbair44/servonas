-- Epic 2.2 Checkpoint 7: explicit, tenant-safe duplicate matching and resolution.
alter table public.employee_import_rows add column duplicate_match_type text not null default 'none',
 add column duplicate_reason text,add column existing_employee_id uuid,add column duplicate_import_row_id uuid,add column duplicate_resolution text not null default 'create',
 add column merge_fields text[] not null default '{}',
 add constraint employee_import_rows_duplicate_type_check check(duplicate_match_type in('none','possible','definite')),
 add constraint employee_import_rows_duplicate_resolution_check check(duplicate_resolution in('create','skip','update','merge')),
 add constraint employee_import_rows_existing_employee_fk foreign key(business_id,existing_employee_id) references public.employees(business_id,id) on delete restrict,
 add constraint employee_import_rows_duplicate_import_row_fk foreign key(business_id,import_id,duplicate_import_row_id) references public.employee_import_rows(business_id,import_id,id) on delete restrict,
 add constraint employee_import_rows_duplicate_state_check check(
  (duplicate_match_type='none' and existing_employee_id is null and duplicate_import_row_id is null and duplicate_resolution='create')
  or (duplicate_match_type in('possible','definite') and num_nonnulls(existing_employee_id,duplicate_import_row_id)=1)
 );

create or replace function public.save_employee_import_duplicate_matches(p_import_id uuid,p_expected_version integer,p_matches jsonb)
returns public.employee_imports language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;x jsonb;v_count int;
begin
 select * into v from public.employee_imports where id=p_import_id for update;
 if not found or not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
 if v.status not in('ready','needs_review') or jsonb_typeof(p_matches)<>'array' then raise exception 'Duplicate input is invalid' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(p_matches) loop
  update public.employee_import_rows set duplicate_match_type=x->>'matchType',duplicate_reason=nullif(x->>'reason',''),
   existing_employee_id=nullif(x->>'existingEmployeeId','')::uuid,duplicate_resolution=x->>'resolution',
   duplicate_import_row_id=nullif(x->>'matchedImportRowId','')::uuid,
   validation_status=case when x->>'matchType'='none' then validation_status else 'duplicate' end,updated_at=now()
  where id=(x->>'rowId')::uuid and import_id=v.id and business_id=v.business_id;
  if not found then raise exception 'Import row not found' using errcode='P0002';end if;
 end loop;
 select count(*) into v_count from public.employee_import_rows where import_id=v.id and duplicate_match_type<>'none';
 update public.employee_imports set duplicate_row_count=v_count,status=case when invalid_row_count>0 then 'needs_review' else 'ready' end,
  current_stage='review',version=version+1,last_activity_at=now(),updated_at=now() where id=v.id returning * into v;
 insert into public.employee_import_events(business_id,import_id,event_type,actor_user_id,to_status,import_version,counts)
 values(v.business_id,v.id,'duplicates_detected',auth.uid(),v.status,v.version,jsonb_build_object('duplicates',v_count,'total',v.total_row_count));
 return v;
end$$;
revoke all on function public.save_employee_import_duplicate_matches(uuid,integer,jsonb) from public;
grant execute on function public.save_employee_import_duplicate_matches(uuid,integer,jsonb) to authenticated;

create or replace function public.resolve_employee_import_duplicate(p_import_id uuid,p_row_id uuid,p_expected_version integer,p_resolution text,p_merge_fields text[] default '{}')
returns public.employee_imports language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;
begin
 select * into v from public.employee_imports where id=p_import_id for update;
 if not found or not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
 if p_resolution not in('create','skip','update','merge') then raise exception 'Invalid duplicate resolution' using errcode='22023';end if;
 if exists(select 1 from unnest(p_merge_fields) field where field not in('email','phone','employee_number','job_title','employee_type','employment_status'))
 then raise exception 'Invalid merge field' using errcode='22023';end if;
 update public.employee_import_rows set duplicate_resolution=p_resolution,merge_fields=case when p_resolution='merge' then p_merge_fields else '{}' end,updated_at=now()
 where id=p_row_id and import_id=v.id and business_id=v.business_id and duplicate_match_type<>'none';
 if not found then raise exception 'Duplicate row not found' using errcode='P0002';end if;
 update public.employee_imports set version=version+1,last_activity_at=now(),updated_at=now() where id=v.id returning * into v;
 insert into public.employee_import_events(business_id,import_id,event_type,actor_user_id,to_status,import_version,metadata)
 values(v.business_id,v.id,'duplicate_resolved',auth.uid(),v.status,v.version,jsonb_build_object('resolution',p_resolution,'selected_field_count',cardinality(p_merge_fields)));
 return v;
end$$;
revoke all on function public.resolve_employee_import_duplicate(uuid,uuid,integer,text,text[]) from public;
grant execute on function public.resolve_employee_import_duplicate(uuid,uuid,integer,text,text[]) to authenticated;
