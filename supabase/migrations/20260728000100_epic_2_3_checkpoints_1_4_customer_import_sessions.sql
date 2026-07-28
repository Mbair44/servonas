-- Epic 2.3 Checkpoints 1-4: customer migration landing, upload, and resumable sessions.
create table if not exists public.customer_imports(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 import_type text not null check(import_type in('customer_list','customer_locations','customer_recurring','custom')),
 source_type text not null default 'spreadsheet' check(source_type in('spreadsheet','connector')),
 file_name text not null,file_extension text not null check(file_extension in('csv','xlsx')),
 file_size_bytes bigint not null check(file_size_bytes between 1 and 26214400),
 file_checksum text not null,storage_path text,
 worksheet_name text,worksheets jsonb not null default '[]' check(jsonb_typeof(worksheets)='array'),
 source_columns jsonb not null default '[]' check(jsonb_typeof(source_columns)='array'),
 column_mappings jsonb not null default '[]' check(jsonb_typeof(column_mappings)='array'),
 grouping_rules jsonb not null default '{}' check(jsonb_typeof(grouping_rules)='object'),
 duplicate_rules jsonb not null default '{}' check(jsonb_typeof(duplicate_rules)='object'),
 import_settings jsonb not null default '{}' check(jsonb_typeof(import_settings)='object'),
 status text not null default 'uploaded' check(status in('uploaded','mapping','analyzing','validating','needs_review','ready','queued','importing','completed','completed_with_errors','failed','canceled','rollback_pending','rolled_back','rollback_partial')),
 current_stage text not null default 'upload' check(current_stage in('upload','worksheet','mapping','grouping','validation','addresses','duplicates','recurring','review','commit','results','rollback')),
 total_row_count integer not null default 0 check(total_row_count between 0 and 25000),
 customer_group_count integer not null default 0,location_group_count integer not null default 0,
 ready_row_count integer not null default 0,warning_row_count integer not null default 0,invalid_row_count integer not null default 0,duplicate_row_count integer not null default 0,
 imported_customer_count integer not null default 0,imported_location_count integer not null default 0,updated_customer_count integer not null default 0,skipped_row_count integer not null default 0,failed_row_count integer not null default 0,
 uploaded_by uuid not null references auth.users(id),request_key uuid not null,
 version integer not null default 1 check(version>0),import_version integer not null default 1 check(import_version>0),
 worker_token uuid,worker_lease_expires_at timestamptz,attempt_count integer not null default 0,
 error_category text,error_code text,rollback_status text not null default 'not_requested' check(rollback_status in('not_requested','eligible','partial','in_progress','completed','completed_with_protected_records','failed')),
 raw_data_expires_at timestamptz not null default(now()+interval '30 days'),started_at timestamptz,last_activity_at timestamptz not null default now(),completed_at timestamptz,canceled_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,id),unique(business_id,request_key)
);
create table if not exists public.customer_import_rows(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,import_id uuid not null,
 source_row_number integer not null check(source_row_number>0),raw_values jsonb not null check(jsonb_typeof(raw_values)='object'),
 normalized_values jsonb not null default '{}' check(jsonb_typeof(normalized_values)='object'),
 status text not null default 'draft' check(status in('draft','ready','warning','invalid','duplicate','skipped','importing','imported','updated','failed','rolled_back','protected')),
 errors jsonb not null default '[]' check(jsonb_typeof(errors)='array'),warnings jsonb not null default '[]' check(jsonb_typeof(warnings)='array'),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,import_id,source_row_number),
 foreign key(business_id,import_id) references public.customer_imports(business_id,id) on delete cascade
);
create table if not exists public.customer_import_events(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,import_id uuid not null,event_type text not null,
 actor_user_id uuid references auth.users(id),metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object'),created_at timestamptz not null default now(),
 foreign key(business_id,import_id) references public.customer_imports(business_id,id) on delete cascade
);
create index if not exists customer_imports_business_activity_idx on public.customer_imports(business_id,last_activity_at desc);
create index if not exists customer_import_rows_status_idx on public.customer_import_rows(business_id,import_id,status);
create index if not exists customer_import_events_history_idx on public.customer_import_events(business_id,import_id,created_at desc);
alter table public.customer_imports enable row level security;alter table public.customer_import_rows enable row level security;alter table public.customer_import_events enable row level security;
do $$ declare t text;begin foreach t in array array['customer_imports','customer_import_rows','customer_import_events'] loop
 execute format('drop policy if exists "customer managers read %1$s" on public.%1$I',t);
 execute format('create policy "customer managers read %1$s" on public.%1$I for select to authenticated using(public.has_business_role(business_id,array[''owner'',''admin'',''manager'']))',t);
 execute format('drop policy if exists "customer managers create %1$s" on public.%1$I',t);
 execute format('create policy "customer managers create %1$s" on public.%1$I for insert to authenticated with check(public.has_business_role(business_id,array[''owner'',''admin'',''manager'']))',t);
 execute format('drop policy if exists "customer managers update %1$s" on public.%1$I',t);
 execute format('create policy "customer managers update %1$s" on public.%1$I for update to authenticated using(public.has_business_role(business_id,array[''owner'',''admin'',''manager''])) with check(public.has_business_role(business_id,array[''owner'',''admin'',''manager'']))',t);
end loop;end$$;
drop policy if exists "customer managers delete import rows" on public.customer_import_rows;
create policy "customer managers delete import rows" on public.customer_import_rows for delete to authenticated using(public.has_business_role(business_id,array['owner','admin','manager']));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('customer-imports','customer-imports',false,26214400,array['text/csv','application/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "customer managers read import files" on storage.objects;
create policy "customer managers read import files" on storage.objects for select to authenticated using(bucket_id='customer-imports' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager']));
drop policy if exists "customer managers upload import files" on storage.objects;
create policy "customer managers upload import files" on storage.objects for insert to authenticated with check(bucket_id='customer-imports' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager']));
drop policy if exists "customer admins delete import files" on storage.objects;
create policy "customer admins delete import files" on storage.objects for delete to authenticated using(bucket_id='customer-imports' and public.has_business_role(((storage.foldername(name))[1])::uuid,array['owner','admin']));
comment on table public.customer_imports is 'Resumable, tenant-scoped customer migration sessions. Access follows active workspace entitlement and customer-management roles, never billing.';
