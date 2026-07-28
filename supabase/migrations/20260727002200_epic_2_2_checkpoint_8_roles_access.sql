-- Epic 2.2 Checkpoint 8: workforce role and login access remain separate.
update public.employee_import_rows set validation_status='error'
where jsonb_array_length(validation_errors)>0 and validation_status='duplicate';

alter table public.employee_import_rows
 add column workforce_role_id uuid,
 add column access_role text,
 add column invite_requested boolean not null default false,
 add column elevated_access_confirmed boolean not null default false,
 add constraint employee_import_rows_workforce_role_fk foreign key(business_id,workforce_role_id) references public.workforce_roles(business_id,id) on delete restrict,
 add constraint employee_import_rows_access_role_check check(access_role is null or access_role in('staff','manager','admin')),
 add constraint employee_import_rows_invite_access_check check(not invite_requested or access_role is not null),
 add constraint employee_import_rows_elevated_check check(access_role not in('manager','admin') or elevated_access_confirmed);

create or replace function public.assign_employee_import_access(
 p_import_id uuid,p_expected_version integer,p_row_ids uuid[],p_workforce_role_id uuid,p_access_role text,
 p_invite boolean,p_confirm_elevated boolean
) returns public.employee_imports language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;v_count int;
begin
 select * into v from public.employee_imports where id=p_import_id for update;
 if not found or not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
 if p_access_role is not null and p_access_role not in('staff','manager','admin') then raise exception 'Owner access cannot be assigned through an import' using errcode='22023';end if;
 if p_access_role in('manager','admin') and not p_confirm_elevated then raise exception 'Elevated access requires explicit confirmation' using errcode='22023';end if;
 if p_invite and p_access_role is null then raise exception 'Choose an access role before requesting invitations' using errcode='22023';end if;
 if p_workforce_role_id is not null and not exists(select 1 from public.workforce_roles where id=p_workforce_role_id and business_id=v.business_id and is_active)
 then raise exception 'Workforce role not found' using errcode='P0002';end if;
 update public.employee_import_rows set workforce_role_id=p_workforce_role_id,access_role=p_access_role,invite_requested=p_invite,
  elevated_access_confirmed=coalesce(p_access_role in('manager','admin'),false) and p_confirm_elevated,updated_at=now()
 where import_id=v.id and business_id=v.business_id and id=any(p_row_ids) and not is_ignored
  and jsonb_array_length(validation_errors)=0;
 get diagnostics v_count=row_count;
 if v_count<>cardinality(p_row_ids) then raise exception 'One or more selected rows cannot be assigned' using errcode='22023';end if;
 update public.employee_imports set current_stage='roles',version=version+1,last_activity_at=now(),updated_at=now() where id=v.id returning * into v;
 insert into public.employee_import_events(business_id,import_id,event_type,actor_user_id,to_status,import_version,metadata)
 values(v.business_id,v.id,case when p_access_role in('manager','admin') then 'elevated_access_confirmed' else 'row_access_assigned' end,
 auth.uid(),v.status,v.version,jsonb_build_object('affected_rows',v_count,'access_role',p_access_role,'invite_requested',p_invite,'workforce_role_assigned',p_workforce_role_id is not null));
 return v;
end$$;
revoke all on function public.assign_employee_import_access(uuid,integer,uuid[],uuid,text,boolean,boolean) from public;
grant execute on function public.assign_employee_import_access(uuid,integer,uuid[],uuid,text,boolean,boolean) to authenticated;
