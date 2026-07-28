-- Epic 2.2 Checkpoint 12: invitation tracking remains separate from employee commit.
create unique index if not exists business_invitations_business_id_id_unique
  on public.business_invitations(business_id,id);

alter table public.employee_import_rows
  add column invitation_id uuid,
  add column invitation_status text not null default 'not_invited',
  add column invitation_attempted_at timestamptz,
  add column invitation_failure_reason text,
  add constraint employee_import_rows_invitation_fk
    foreign key(business_id,invitation_id) references public.business_invitations(business_id,id) on delete set null,
  add constraint employee_import_rows_invitation_status_check check(
    invitation_status in('not_invited','pending','sent','accepted','expired','failed','revoked')
  ),
  add constraint employee_import_rows_invitation_state_check check(
    (invitation_status='not_invited' and invitation_id is null)
    or invitation_status<>'not_invited'
  );

create index employee_import_rows_invitation_lookup_idx
  on public.employee_import_rows(business_id,import_id,invitation_status);

create or replace function public.record_employee_import_invitation_results(
  p_import_id uuid,p_expected_version integer,p_results jsonb
) returns public.employee_imports
language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;x jsonb;v_count integer;
begin
  select * into v from public.employee_imports where id=p_import_id for update;
  if not found or not public.has_business_role(v.business_id,array['owner','admin']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if v.version<>p_expected_version then
    raise exception 'Import session changed; refresh and try again' using errcode='40001';
  end if;
  if v.status not in('completed','completed_with_errors') or jsonb_typeof(p_results)<>'array' then
    raise exception 'Invitation results are invalid' using errcode='22023';
  end if;
  for x in select value from jsonb_array_elements(p_results) loop
    update public.employee_import_rows set
      invitation_id=nullif(x->>'invitationId','')::uuid,
      invitation_status=x->>'status',invitation_attempted_at=now(),
      invitation_failure_reason=nullif(x->>'failureReason',''),updated_at=now()
    where id=(x->>'rowId')::uuid and business_id=v.business_id and import_id=v.id
      and committed_employee_id is not null and invite_requested;
    if not found then raise exception 'Invitation row not found' using errcode='P0002';end if;
  end loop;
  v_count:=jsonb_array_length(p_results);
  update public.employee_imports set current_stage='results',version=version+1,
    last_activity_at=now(),updated_at=now(),
    metadata=metadata||jsonb_build_object('invitation_attempt_count',v_count)
  where id=v.id returning * into v;
  insert into public.employee_import_events(
    business_id,import_id,event_type,actor_user_id,to_status,import_version,counts,metadata
  ) values(
    v.business_id,v.id,'import_invitations_processed',auth.uid(),v.status,v.version,
    jsonb_build_object(
      'attempted',v_count,
      'sent',(select count(*) from jsonb_array_elements(p_results)y where y->>'status'='sent'),
      'failed',(select count(*) from jsonb_array_elements(p_results)y where y->>'status'='failed')
    ),jsonb_build_object('provider_details_exposed',false)
  );
  return v;
end$$;

revoke all on function public.record_employee_import_invitation_results(uuid,integer,jsonb) from public;
grant execute on function public.record_employee_import_invitation_results(uuid,integer,jsonb) to authenticated;
