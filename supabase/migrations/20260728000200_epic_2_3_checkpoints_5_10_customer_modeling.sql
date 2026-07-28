-- Epic 2.3 Checkpoints 5-10: mapping, normalized entities, contacts, billing addresses, and duplicate decisions.
create table if not exists public.customer_contacts(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,customer_id uuid not null,label text,
 first_name text not null default '',last_name text not null default '',email text,phone text,is_primary boolean not null default false,is_active boolean not null default true,
 created_by uuid references auth.users(id),updated_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,id),foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade
);
create unique index if not exists customer_contacts_one_primary_idx on public.customer_contacts(business_id,customer_id) where is_primary and is_active;
create unique index if not exists customer_contacts_email_dedupe_idx on public.customer_contacts(business_id,customer_id,lower(email)) where email is not null and is_active;
create table if not exists public.customer_addresses(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,customer_id uuid not null,address_type text not null check(address_type in('billing','mailing')),
 label text,street_address text not null,unit text,city text not null,state text not null,postal_code text,country text not null default 'US',is_primary boolean not null default false,is_active boolean not null default true,
 resolution_state text not null default 'unverified' check(resolution_state in('unverified','pending','verified','ambiguous','failed','kept_original')),
 provider_place_id text,latitude numeric(10,7),longitude numeric(10,7),created_by uuid references auth.users(id),updated_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,id),foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade
);
create unique index if not exists customer_addresses_one_primary_type_idx on public.customer_addresses(business_id,customer_id,address_type) where is_primary and is_active;
create table if not exists public.customer_external_references(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,source_system text not null,entity_type text not null check(entity_type in('customer','contact','service_location','recurring_service')),
 external_id text not null,customer_id uuid,contact_id uuid,service_location_id uuid,recurring_service_id uuid,created_at timestamptz not null default now(),
 unique(business_id,source_system,entity_type,external_id),foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade,
 foreign key(business_id,contact_id) references public.customer_contacts(business_id,id) on delete cascade,
 foreign key(business_id,service_location_id) references public.service_locations(business_id,id) on delete cascade
);
create table if not exists public.customer_import_mappings(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,import_id uuid not null,source_column text not null,source_ordinal integer not null,destination_field text,
 confidence text not null check(confidence in('exact','strong','possible','manual','unmatched')),is_ignored boolean not null default false,transformation jsonb not null default '{}' check(jsonb_typeof(transformation)='object'),
 unique(business_id,import_id,source_ordinal),foreign key(business_id,import_id) references public.customer_imports(business_id,id) on delete cascade
);
create table if not exists public.customer_import_entities(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,import_id uuid not null,entity_type text not null check(entity_type in('customer','contact','service_location','billing_address','recurring_service','note','attachment_placeholder')),
 group_key text not null,source_row_numbers integer[] not null default '{}',normalized_values jsonb not null default '{}' check(jsonb_typeof(normalized_values)='object'),
 status text not null default 'draft' check(status in('draft','ready','warning','invalid','duplicate','skipped','importing','imported','updated','failed','rolled_back','protected')),
 errors jsonb not null default '[]',warnings jsonb not null default '[]',destination_id uuid,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,import_id,entity_type,group_key),unique(business_id,id),foreign key(business_id,import_id) references public.customer_imports(business_id,id) on delete cascade
);
create table if not exists public.customer_import_duplicate_candidates(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,import_id uuid not null,entity_id uuid not null,existing_customer_id uuid not null,
 score integer not null check(score between -100 and 500),match_level text not null check(match_level in('definite','possible')),signals jsonb not null default '[]',created_at timestamptz not null default now(),
 unique(business_id,entity_id,existing_customer_id),foreign key(business_id,import_id) references public.customer_imports(business_id,id) on delete cascade,
 foreign key(business_id,entity_id) references public.customer_import_entities(business_id,id) on delete cascade,foreign key(business_id,existing_customer_id) references public.customers(business_id,id) on delete cascade
);
create table if not exists public.customer_import_duplicate_decisions(
 id uuid primary key default gen_random_uuid(),business_id uuid not null,import_id uuid not null,entity_id uuid not null,candidate_id uuid,
 decision text not null check(decision in('create','link_add_location','update_selected','skip')),field_updates jsonb not null default '{}' check(jsonb_typeof(field_updates)='object'),
 decided_by uuid not null references auth.users(id),decided_at timestamptz not null default now(),unique(business_id,entity_id),
 foreign key(business_id,import_id) references public.customer_imports(business_id,id) on delete cascade,foreign key(business_id,entity_id) references public.customer_import_entities(business_id,id) on delete cascade
);
do $$ declare t text;begin foreach t in array array['customer_contacts','customer_addresses','customer_external_references','customer_import_mappings','customer_import_entities','customer_import_duplicate_candidates','customer_import_duplicate_decisions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy "customer managers read %1$s" on public.%1$I for select to authenticated using(public.has_business_role(business_id,array[''owner'',''admin'',''manager'']))',t);
 execute format('create policy "customer managers create %1$s" on public.%1$I for insert to authenticated with check(public.has_business_role(business_id,array[''owner'',''admin'',''manager'']))',t);
 execute format('create policy "customer managers update %1$s" on public.%1$I for update to authenticated using(public.has_business_role(business_id,array[''owner'',''admin'',''manager''])) with check(public.has_business_role(business_id,array[''owner'',''admin'',''manager'']))',t);
end loop;end$$;
comment on table public.customer_addresses is 'Customer billing and mailing addresses. Operational addresses remain service_locations.';
comment on table public.customer_external_references is 'Source-scoped identities used for idempotent spreadsheet and future connector migrations.';
