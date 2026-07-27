-- Epic 2.2 Checkpoint 5: validated column mappings and reusable tenant profiles.
alter table public.employee_import_column_mappings
  add constraint employee_import_mapping_destination_check check (
    destination_field is null or destination_field in (
      'first_name','last_name','full_name','preferred_name','email','phone',
      'employee_number','job_title','role','employee_type','start_date',
      'employment_status','manager','location','territory','skills','invite','notes'
    )
  ),
  add constraint employee_import_mapping_transformation_check check (
    transformation in ('none','split_name')
    and (transformation<>'split_name' or destination_field='full_name')
  );
create unique index employee_import_one_destination_idx
  on public.employee_import_column_mappings(import_id,destination_field)
  where destination_field is not null and not is_ignored;

create table public.employee_import_mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 100),
  source_headers text[] not null check (cardinality(source_headers) between 1 and 100),
  normalized_headers text[] not null check (cardinality(normalized_headers)=cardinality(source_headers)),
  mappings jsonb not null check (jsonb_typeof(mappings)='array'),
  created_by uuid not null references auth.users(id),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,name)
);
alter table public.employee_import_mapping_profiles enable row level security;
create policy "admins read employee import mapping profiles"
  on public.employee_import_mapping_profiles for select to authenticated
  using (public.has_business_role(business_id,array['owner','admin']));

create or replace function public.save_employee_import_mappings(
  p_import_id uuid,
  p_expected_version integer,
  p_mappings jsonb,
  p_profile_name text default null,
  p_applied_profile_id uuid default null
) returns public.employee_imports
language plpgsql security definer set search_path=public as $$
declare
  v_import public.employee_imports;
  v_mapping jsonb;
  v_previous_status text;
  v_destinations text[];
  v_has_structured_name boolean;
  v_has_split_name boolean;
  v_headers text[];
  v_normalized_headers text[];
begin
  select * into v_import from public.employee_imports where id=p_import_id for update;
  if not found then raise exception 'Import session not found' using errcode='P0002'; end if;
  if not public.has_business_role(v_import.business_id,array['owner','admin']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if v_import.status not in ('uploaded','mapping') then
    raise exception 'Column mappings cannot be changed at this import stage' using errcode='22023';
  end if;
  if v_import.version<>p_expected_version then
    raise exception 'Import session changed; refresh and try again' using errcode='40001';
  end if;
  if jsonb_typeof(p_mappings)<>'array'
     or jsonb_array_length(p_mappings)<>jsonb_array_length(v_import.source_columns) then
    raise exception 'Every source column needs a mapping or must be ignored' using errcode='22023';
  end if;

  for v_mapping in select value from jsonb_array_elements(p_mappings)
  loop
    if jsonb_typeof(v_mapping)<>'object'
       or (v_mapping->>'sourceOrdinal')!~'^[0-9]+$'
       or (v_mapping->>'sourceOrdinal')::integer not between 0 and 99
       or coalesce(v_mapping->>'sourceColumn','')=''
       or coalesce(v_mapping->>'confidence','') not in ('exact','high','medium','manual','unmatched')
       or coalesce(v_mapping->>'transformation','') not in ('none','split_name')
       or coalesce((v_mapping->>'isIgnored')::boolean,false)=false
          and coalesce(v_mapping->>'destinationField','') not in (
            'first_name','last_name','full_name','preferred_name','email','phone',
            'employee_number','job_title','role','employee_type','start_date',
            'employment_status','manager','location','territory','skills','invite','notes'
          )
       or coalesce((v_mapping->>'isIgnored')::boolean,false)=true
          and nullif(v_mapping->>'destinationField','') is not null
       or (v_mapping->>'transformation')='split_name' and (v_mapping->>'destinationField')<>'full_name'
    then raise exception 'A column mapping is invalid' using errcode='22023';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(v_import.source_columns) with ordinality source(value,ordinality)
      where ordinality-1=(v_mapping->>'sourceOrdinal')::integer
        and value->>'name'=v_mapping->>'sourceColumn'
    ) then raise exception 'Source columns changed; upload the file again' using errcode='22023';
    end if;
  end loop;

  select array_agg(value->>'destinationField') into v_destinations
  from jsonb_array_elements(p_mappings)
  where coalesce((value->>'isIgnored')::boolean,false)=false
    and nullif(value->>'destinationField','') is not null;
  if exists (
    select 1 from unnest(coalesce(v_destinations,array[]::text[])) destination
    group by destination having count(*)>1
  ) then raise exception 'A Servonas field is mapped more than once' using errcode='23505'; end if;
  v_has_structured_name := 'first_name'=any(coalesce(v_destinations,array[]::text[]))
    and 'last_name'=any(coalesce(v_destinations,array[]::text[]));
  select exists (
    select 1 from jsonb_array_elements(p_mappings)
    where value->>'destinationField'='full_name'
      and value->>'transformation'='split_name'
      and coalesce((value->>'isIgnored')::boolean,false)=false
  ) into v_has_split_name;
  if not v_has_structured_name and not v_has_split_name then
    raise exception 'Map First name and Last name, or split a Full name column' using errcode='22023';
  end if;

  delete from public.employee_import_column_mappings where import_id=v_import.id;
  insert into public.employee_import_column_mappings(
    business_id,import_id,source_column,source_ordinal,destination_field,
    transformation,confidence,is_ignored
  )
  select v_import.business_id,v_import.id,
    value->>'sourceColumn',(value->>'sourceOrdinal')::integer,
    nullif(value->>'destinationField',''),value->>'transformation',
    value->>'confidence',coalesce((value->>'isIgnored')::boolean,false)
  from jsonb_array_elements(p_mappings);

  v_previous_status:=v_import.status;
  update public.employee_imports set
    status='mapping',current_stage='mapping',version=version+1,
    last_activity_at=now(),updated_at=now()
  where id=v_import.id returning * into v_import;
  insert into public.employee_import_events(
    business_id,import_id,event_type,actor_user_id,from_status,to_status,import_version,counts,metadata
  ) values (
    v_import.business_id,v_import.id,'mappings_confirmed',auth.uid(),
    v_previous_status,'mapping',v_import.version,jsonb_build_object('total',v_import.total_row_count),
    jsonb_build_object('mapped_columns',cardinality(v_destinations),'ignored_columns',jsonb_array_length(p_mappings)-cardinality(v_destinations))
  );

  select array_agg(value->>'name' order by ordinality),
    array_agg(regexp_replace(lower(value->>'name'),'[^a-z0-9]+','','g') order by ordinality)
  into v_headers,v_normalized_headers
  from jsonb_array_elements(v_import.source_columns) with ordinality source(value,ordinality);
  if p_applied_profile_id is not null then
    update public.employee_import_mapping_profiles set last_used_at=now(),updated_at=now()
    where id=p_applied_profile_id and business_id=v_import.business_id
      and normalized_headers=v_normalized_headers;
    if not found then raise exception 'The saved mapping profile no longer matches this file' using errcode='22023'; end if;
  end if;
  if nullif(btrim(coalesce(p_profile_name,'')),'') is not null then
    if length(btrim(p_profile_name)) not between 2 and 100 then
      raise exception 'Mapping profile name must be between 2 and 100 characters' using errcode='22023';
    end if;
    insert into public.employee_import_mapping_profiles(
      business_id,name,source_headers,normalized_headers,mappings,created_by
    ) values (
      v_import.business_id,btrim(p_profile_name),v_headers,v_normalized_headers,p_mappings,auth.uid()
    ) on conflict(business_id,name) do update set
      source_headers=excluded.source_headers,normalized_headers=excluded.normalized_headers,
      mappings=excluded.mappings,last_used_at=now(),updated_at=now();
  end if;
  return v_import;
end$$;
revoke all on function public.save_employee_import_mappings(uuid,integer,jsonb,text,uuid) from public;
grant execute on function public.save_employee_import_mappings(uuid,integer,jsonb,text,uuid) to authenticated;

comment on table public.employee_import_mapping_profiles is
  'Tenant-owned reusable mappings. Profiles are auto-applied only when normalized source headers match exactly.';
