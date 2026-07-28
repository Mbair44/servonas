-- Epic 2.2 Checkpoint 6: tenant-private normalized rows and authoritative validation results.
create table public.employee_import_rows(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,
 import_id uuid not null,source_row_number integer not null check(source_row_number between 2 and 2002),
 raw_values jsonb not null check(jsonb_typeof(raw_values)='array'),normalized_values jsonb not null check(jsonb_typeof(normalized_values)='object'),
 validation_status text not null check(validation_status in('ready','warning','error','duplicate','ignored')),
 validation_errors jsonb not null default '[]' check(jsonb_typeof(validation_errors)='array'),
 validation_warnings jsonb not null default '[]' check(jsonb_typeof(validation_warnings)='array'),
 is_ignored boolean not null default false,edited_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(import_id,source_row_number),unique(business_id,import_id,source_row_number),
 foreign key(business_id,import_id) references public.employee_imports(business_id,id) on delete cascade
);
alter table public.employee_import_rows enable row level security;
create policy "admins read employee import rows" on public.employee_import_rows for select to authenticated using(public.has_business_role(business_id,array['owner','admin']));

create or replace function public.save_employee_import_validation(p_import_id uuid,p_expected_version integer,p_rows jsonb)
returns public.employee_imports language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;v_ready int;v_warning int;v_error int;
begin
 select * into v from public.employee_imports where id=p_import_id for update;
 if not found then raise exception 'Import session not found' using errcode='P0002';end if;
 if not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
 if v.status<>'mapping' or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<>v.total_row_count then raise exception 'Validation input is incomplete' using errcode='22023';end if;
 delete from public.employee_import_rows where import_id=v.id;
 insert into public.employee_import_rows(business_id,import_id,source_row_number,raw_values,normalized_values,validation_status,validation_errors,validation_warnings)
 select v.business_id,v.id,(x->>'sourceRowNumber')::int,x->'rawValues',x->'normalizedValues',x->>'status',x->'errors',x->'warnings'
 from jsonb_array_elements(p_rows)x;
 select count(*)filter(where validation_status='ready'),count(*)filter(where validation_status='warning'),count(*)filter(where validation_status='error')
 into v_ready,v_warning,v_error from public.employee_import_rows where import_id=v.id;
 update public.employee_imports set status=case when v_error>0 then 'needs_review' else 'ready' end,current_stage='review',
  valid_row_count=v_ready,warning_row_count=v_warning,invalid_row_count=v_error,version=version+1,last_activity_at=now(),updated_at=now()
 where id=v.id returning * into v;
 insert into public.employee_import_events(business_id,import_id,event_type,actor_user_id,from_status,to_status,import_version,counts)
 values(v.business_id,v.id,'rows_validated',auth.uid(),'mapping',v.status,v.version,jsonb_build_object('total',v.total_row_count,'valid',v_ready,'warning',v_warning,'invalid',v_error));
 return v;
end$$;
revoke all on function public.save_employee_import_validation(uuid,integer,jsonb) from public;
grant execute on function public.save_employee_import_validation(uuid,integer,jsonb) to authenticated;

create or replace function public.revalidate_employee_import_row(
 p_import_id uuid,p_row_id uuid,p_expected_version integer,p_normalized_values jsonb,
 p_status text,p_errors jsonb,p_warnings jsonb,p_ignore boolean default false
) returns public.employee_imports language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;v_ready int;v_warning int;v_error int;
begin
 select * into v from public.employee_imports where id=p_import_id for update;
 if not found then raise exception 'Import session not found' using errcode='P0002';end if;
 if not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
 if v.status not in('needs_review','ready') or jsonb_typeof(p_normalized_values)<>'object'
  or jsonb_typeof(p_errors)<>'array' or jsonb_typeof(p_warnings)<>'array'
  or p_status not in('ready','warning','error','ignored') then raise exception 'Invalid row correction' using errcode='22023';end if;
 update public.employee_import_rows set normalized_values=p_normalized_values,
  validation_status=case when p_ignore then 'ignored' else p_status end,validation_errors=case when p_ignore then '[]'::jsonb else p_errors end,
  validation_warnings=case when p_ignore then '[]'::jsonb else p_warnings end,is_ignored=p_ignore,edited_at=now(),updated_at=now()
 where id=p_row_id and import_id=v.id and business_id=v.business_id;
 if not found then raise exception 'Import row not found' using errcode='P0002';end if;
 select count(*)filter(where validation_status='ready'),count(*)filter(where validation_status='warning'),count(*)filter(where validation_status='error')
 into v_ready,v_warning,v_error from public.employee_import_rows where import_id=v.id and not is_ignored;
 update public.employee_imports set status=case when v_error>0 then 'needs_review' else 'ready' end,
  valid_row_count=v_ready,warning_row_count=v_warning,invalid_row_count=v_error,version=version+1,last_activity_at=now(),updated_at=now()
 where id=v.id returning * into v;
 insert into public.employee_import_events(business_id,import_id,event_type,actor_user_id,from_status,to_status,import_version,counts,metadata)
 values(v.business_id,v.id,case when p_ignore then 'row_ignored' else 'row_corrected' end,auth.uid(),null,v.status,v.version,
 jsonb_build_object('total',v.total_row_count,'valid',v_ready,'warning',v_warning,'invalid',v_error),jsonb_build_object('source_row_changed',true));
 return v;
end$$;
revoke all on function public.revalidate_employee_import_row(uuid,uuid,integer,jsonb,text,jsonb,jsonb,boolean) from public;
grant execute on function public.revalidate_employee_import_row(uuid,uuid,integer,jsonb,text,jsonb,jsonb,boolean) to authenticated;

create or replace function public.bulk_revalidate_employee_import_rows(p_import_id uuid,p_expected_version integer,p_rows jsonb,p_operation text)
returns public.employee_imports language plpgsql security definer set search_path=public as $$
declare v public.employee_imports;x jsonb;v_ready int;v_warning int;v_error int;
begin
 select * into v from public.employee_imports where id=p_import_id for update;
 if not found or not public.has_business_role(v.business_id,array['owner','admin']) then raise exception 'Permission denied' using errcode='42501';end if;
 if v.version<>p_expected_version then raise exception 'Import session changed; refresh and try again' using errcode='40001';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>v.total_row_count then raise exception 'Invalid bulk correction' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(p_rows) loop
  update public.employee_import_rows set normalized_values=x->'normalizedValues',validation_status=x->>'status',
   validation_errors=x->'errors',validation_warnings=x->'warnings',edited_at=now(),updated_at=now()
  where id=(x->>'id')::uuid and import_id=v.id and business_id=v.business_id;
  if not found then raise exception 'Import row not found' using errcode='P0002';end if;
 end loop;
 select count(*)filter(where validation_status='ready'),count(*)filter(where validation_status='warning'),count(*)filter(where validation_status='error')
 into v_ready,v_warning,v_error from public.employee_import_rows where import_id=v.id and not is_ignored;
 update public.employee_imports set status=case when v_error>0 then 'needs_review' else 'ready' end,valid_row_count=v_ready,
  warning_row_count=v_warning,invalid_row_count=v_error,version=version+1,last_activity_at=now(),updated_at=now() where id=v.id returning * into v;
 insert into public.employee_import_events(business_id,import_id,event_type,actor_user_id,to_status,import_version,counts,metadata)
 values(v.business_id,v.id,'rows_bulk_corrected',auth.uid(),v.status,v.version,jsonb_build_object('valid',v_ready,'warning',v_warning,'invalid',v_error),
 jsonb_build_object('operation',p_operation,'affected_rows',jsonb_array_length(p_rows)));
 return v;
end$$;
revoke all on function public.bulk_revalidate_employee_import_rows(uuid,integer,jsonb,text) from public;
grant execute on function public.bulk_revalidate_employee_import_rows(uuid,integer,jsonb,text) to authenticated;
