-- Epic 2.2 Checkpoint 16: conservative rollback preview and execution.
create or replace function public.preview_employee_import_rollback(p_import_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v public.employee_imports;result jsonb;
begin
 select * into v from public.employee_imports where id=p_import_id;
 if not found or not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 select jsonb_build_object(
  'deactivate',count(*) filter(where r.commit_status='imported' and e.auth_user_id is null and tp.id is null and not exists(select 1 from public.employee_performance_facts f where f.business_id=v.business_id and f.employee_id=e.id)),
  'protected',count(*) filter(where r.commit_status='imported' and (e.auth_user_id is not null or tp.id is not null or exists(select 1 from public.employee_performance_facts f where f.business_id=v.business_id and f.employee_id=e.id))),
  'existingUpdatesPreserved',count(*) filter(where r.commit_status='updated'),
  'pendingInvitations',count(*) filter(where r.invitation_id is not null and i.accepted_at is null),
  'assignmentsRemoved',coalesce(sum(
    (select count(*) from public.employee_role_assignments a where a.business_id=v.business_id and a.employee_id=e.id and a.assigned_by=v.uploaded_by)+
    (select count(*) from public.employee_qualifications a where a.business_id=v.business_id and a.employee_id=e.id and a.assigned_by=v.uploaded_by)+
    (select count(*) from public.employee_territory_assignments a where a.business_id=v.business_id and a.employee_id=e.id and a.created_by=v.uploaded_by and a.notes='Assigned by employee import')
  ) filter(where r.commit_status='imported'),0)
 ) into result
 from public.employee_import_rows r
 left join public.employees e on e.business_id=r.business_id and e.id=r.committed_employee_id
 left join public.technician_profiles tp on tp.business_id=e.business_id and tp.employee_id=e.id
 left join public.business_invitations i on i.business_id=r.business_id and i.id=r.invitation_id
 where r.business_id=v.business_id and r.import_id=v.id;
 return coalesce(result,'{}'::jsonb);
end$$;

create or replace function public.rollback_employee_import(p_import_id uuid,p_expected_version integer)
returns public.employee_imports language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;v_deactivated int;v_protected int;v_revoked int;
begin
 select * into v from public.employee_imports where id=p_import_id for update;
 if not found or not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
 if v.status not in('completed','completed_with_errors') or v.rollback_status not in('eligible','partial') then raise exception 'This import is not eligible for rollback' using errcode='22023';end if;

 delete from public.business_invitations i using public.employee_import_rows r
  where r.business_id=v.business_id and r.import_id=v.id and r.invitation_id=i.id and i.accepted_at is null;
 get diagnostics v_revoked=row_count;
 update public.employee_import_rows set invitation_status='revoked',invitation_id=null,updated_at=now()
  where business_id=v.business_id and import_id=v.id and invitation_status in('pending','sent','failed','expired');
 delete from public.employee_role_assignments a using public.employee_import_rows r
  where r.business_id=v.business_id and r.import_id=v.id and r.commit_status='imported'
    and a.business_id=v.business_id and a.employee_id=r.committed_employee_id and a.assigned_by=v.uploaded_by;
 delete from public.employee_qualifications a using public.employee_import_rows r
  where r.business_id=v.business_id and r.import_id=v.id and r.commit_status='imported'
    and a.business_id=v.business_id and a.employee_id=r.committed_employee_id and a.assigned_by=v.uploaded_by;
 delete from public.employee_territory_assignments a using public.employee_import_rows r
  where r.business_id=v.business_id and r.import_id=v.id and r.commit_status='imported'
    and a.business_id=v.business_id and a.employee_id=r.committed_employee_id and a.created_by=v.uploaded_by
    and a.notes='Assigned by employee import';
 update public.employees e set employment_status='inactive',is_active=false,updated_by=auth.uid(),updated_at=now()
  from public.employee_import_rows r
  where r.business_id=v.business_id and r.import_id=v.id and r.commit_status='imported'
    and e.business_id=v.business_id and e.id=r.committed_employee_id and e.auth_user_id is null
    and not exists(select 1 from public.technician_profiles tp where tp.business_id=v.business_id and tp.employee_id=e.id)
    and not exists(select 1 from public.employee_performance_facts f where f.business_id=v.business_id and f.employee_id=e.id);
 get diagnostics v_deactivated=row_count;
 select count(*) into v_protected from public.employee_import_rows r join public.employees e on e.business_id=r.business_id and e.id=r.committed_employee_id
  where r.business_id=v.business_id and r.import_id=v.id and r.commit_status='imported' and e.is_active;
 update public.employee_imports set status='rolled_back',current_stage='results',rollback_status=case when v_protected>0 then 'partial' else 'completed' end,
  version=version+1,last_activity_at=now(),updated_at=now() where id=v.id returning * into v;
 insert into public.employee_import_events(business_id,import_id,event_type,actor_user_id,from_status,to_status,import_version,counts,metadata)
 values(v.business_id,v.id,'import_rolled_back',auth.uid(),null,v.status,v.version,
  jsonb_build_object('deactivated',v_deactivated,'protected',v_protected,'invitations_revoked',v_revoked),
  jsonb_build_object('destructive_employee_deletion',false));
 return v;
end$$;
revoke all on function public.preview_employee_import_rollback(uuid) from public;
grant execute on function public.preview_employee_import_rollback(uuid) to authenticated;
revoke all on function public.rollback_employee_import(uuid,integer) from public;
grant execute on function public.rollback_employee_import(uuid,integer) to authenticated;
