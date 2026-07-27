-- Epic 2.2 Checkpoint 4: complete, resumable employee-import session lifecycle.
alter table public.employee_imports
  drop constraint if exists employee_imports_status_check,
  drop constraint if exists employee_imports_current_stage_check;

alter table public.employee_imports
  add column if not exists valid_row_count integer not null default 0,
  add column if not exists warning_row_count integer not null default 0,
  add column if not exists invalid_row_count integer not null default 0,
  add column if not exists duplicate_row_count integer not null default 0,
  add column if not exists imported_row_count integer not null default 0,
  add column if not exists failed_row_count integer not null default 0,
  add column if not exists import_settings jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists rollback_status text not null default 'not_requested',
  add column if not exists version integer not null default 1;

alter table public.employee_imports
  add constraint employee_imports_status_check check (status in (
    'uploaded','mapping','validating','needs_review','ready','importing',
    'completed','completed_with_errors','failed','canceled','rolled_back'
  )),
  add constraint employee_imports_current_stage_check check (current_stage in (
    'upload','mapping','validation','review','roles','commit','invite','results'
  )),
  add constraint employee_imports_counts_check check (
    valid_row_count between 0 and total_row_count
    and warning_row_count between 0 and total_row_count
    and invalid_row_count between 0 and total_row_count
    and duplicate_row_count between 0 and total_row_count
    and imported_row_count between 0 and total_row_count
    and failed_row_count between 0 and total_row_count
  ),
  add constraint employee_imports_settings_check check (jsonb_typeof(import_settings)='object'),
  add constraint employee_imports_metadata_check check (jsonb_typeof(metadata)='object'),
  add constraint employee_imports_rollback_status_check check (rollback_status in (
    'not_requested','eligible','pending','partial','blocked','completed'
  )),
  add constraint employee_imports_version_check check (version > 0),
  add constraint employee_imports_terminal_timestamps_check check (
    (status <> 'canceled' or canceled_at is not null)
    and (status not in ('completed','completed_with_errors','rolled_back') or completed_at is not null)
  );

create table if not exists public.employee_import_column_mappings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  import_id uuid not null,
  source_column text not null,
  source_ordinal integer not null check (source_ordinal between 0 and 99),
  destination_field text,
  transformation text not null default 'none',
  confidence text not null default 'unmatched' check (confidence in ('exact','high','medium','manual','unmatched')),
  is_ignored boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_id,source_ordinal),
  unique (business_id,import_id,source_ordinal),
  foreign key (business_id,import_id) references public.employee_imports(business_id,id) on delete cascade,
  check ((is_ignored and destination_field is null) or not is_ignored)
);
alter table public.employee_import_column_mappings enable row level security;
create policy "admins read employee import mappings"
  on public.employee_import_column_mappings for select to authenticated
  using (public.has_business_role(business_id,array['owner','admin']));

create table if not exists public.employee_import_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  import_id uuid not null,
  event_type text not null,
  actor_user_id uuid references auth.users(id),
  from_status text,
  to_status text,
  import_version integer not null,
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts)='object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now(),
  foreign key (business_id,import_id) references public.employee_imports(business_id,id) on delete cascade
);
create index if not exists employee_import_events_tenant_session_idx
  on public.employee_import_events(business_id,import_id,occurred_at desc);
alter table public.employee_import_events enable row level security;
create policy "admins read employee import events"
  on public.employee_import_events for select to authenticated
  using (public.has_business_role(business_id,array['owner','admin']));

create or replace function public.prevent_employee_import_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Employee import audit events are immutable' using errcode='42501'; end$$;
drop trigger if exists employee_import_events_immutable on public.employee_import_events;
create trigger employee_import_events_immutable before update or delete
  on public.employee_import_events for each row execute function public.prevent_employee_import_event_mutation();

create or replace function public.audit_employee_import_created()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.employee_import_events(
    business_id,import_id,event_type,actor_user_id,to_status,import_version,counts,metadata,occurred_at
  ) values (
    new.business_id,new.id,'session_created',new.uploaded_by,new.status,new.version,
    jsonb_build_object('total',new.total_row_count),'{}'::jsonb,new.created_at
  );
  return new;
end$$;
drop trigger if exists employee_import_created_audit on public.employee_imports;
create trigger employee_import_created_audit after insert on public.employee_imports
  for each row execute function public.audit_employee_import_created();

-- Session lifecycle and counts are server-controlled. Browser code cannot update
-- the session table directly; every transition uses optimistic concurrency.
drop policy if exists "admins update employee imports" on public.employee_imports;
drop policy if exists "admins create employee imports" on public.employee_imports;
create policy "admins create employee imports" on public.employee_imports for insert to authenticated
with check (
  uploaded_by=auth.uid()
  and public.has_business_role(business_id,array['owner','admin'])
  and status='uploaded' and current_stage='mapping' and version=1
  and valid_row_count=0 and warning_row_count=0 and invalid_row_count=0
  and duplicate_row_count=0 and imported_row_count=0 and failed_row_count=0
  and storage_path is not null
);

create or replace function public.transition_employee_import(
  p_import_id uuid,
  p_expected_version integer,
  p_next_status text,
  p_next_stage text,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
) returns public.employee_imports
language plpgsql security definer set search_path=public as $$
declare
  v_import public.employee_imports;
  v_previous_status text;
  v_allowed boolean := false;
begin
  select * into v_import from public.employee_imports where id=p_import_id for update;
  if not found then raise exception 'Import session not found' using errcode='P0002'; end if;
  if not public.has_business_role(v_import.business_id,array['owner','admin']) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if v_import.version<>p_expected_version then
    raise exception 'Import session changed; refresh and try again' using errcode='40001';
  end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then
    raise exception 'Invalid transition metadata' using errcode='22023';
  end if;
  v_previous_status := v_import.status;
  v_allowed := case v_import.status
    when 'uploaded' then p_next_status in ('mapping','failed','canceled')
    when 'mapping' then p_next_status in ('validating','failed','canceled')
    when 'validating' then p_next_status in ('needs_review','ready','failed','canceled')
    when 'needs_review' then p_next_status in ('validating','ready','failed','canceled')
    when 'ready' then p_next_status in ('importing','canceled')
    when 'importing' then p_next_status in ('completed','completed_with_errors','failed')
    when 'completed' then p_next_status='rolled_back'
    when 'completed_with_errors' then p_next_status='rolled_back'
    else false end;
  if not v_allowed then
    raise exception 'Invalid employee import transition: % to %',v_import.status,p_next_status using errcode='22023';
  end if;

  update public.employee_imports set
    status=p_next_status,
    current_stage=p_next_stage,
    version=version+1,
    last_activity_at=now(),
    updated_at=now(),
    canceled_at=case when p_next_status='canceled' then now() else canceled_at end,
    completed_at=case when p_next_status in ('completed','completed_with_errors','rolled_back') then now() else completed_at end,
    rollback_status=case when p_next_status='rolled_back' then 'completed' else rollback_status end
  where id=p_import_id returning * into v_import;

  insert into public.employee_import_events(
    business_id,import_id,event_type,actor_user_id,from_status,to_status,import_version,counts,metadata
  ) values (
    v_import.business_id,v_import.id,p_event_type,auth.uid(),
    v_previous_status,p_next_status,v_import.version,
    jsonb_build_object(
      'total',v_import.total_row_count,'valid',v_import.valid_row_count,
      'warning',v_import.warning_row_count,'invalid',v_import.invalid_row_count,
      'duplicate',v_import.duplicate_row_count,'imported',v_import.imported_row_count,'failed',v_import.failed_row_count
    ),coalesce(p_metadata,'{}'::jsonb)
  );
  return v_import;
end$$;
revoke all on function public.transition_employee_import(uuid,integer,text,text,text,jsonb) from public;
grant execute on function public.transition_employee_import(uuid,integer,text,text,text,jsonb) to authenticated;

insert into public.employee_import_events(
  business_id,import_id,event_type,actor_user_id,to_status,import_version,counts,metadata,occurred_at
)
select business_id,id,'session_created',uploaded_by,status,version,
  jsonb_build_object('total',total_row_count),'{}'::jsonb,created_at
from public.employee_imports i
where not exists (select 1 from public.employee_import_events e where e.import_id=i.id);

comment on function public.transition_employee_import(uuid,integer,text,text,text,jsonb) is
  'Tenant-authorized, optimistic import-session transition boundary. Counts are snapshots only and contain no employee PII.';
