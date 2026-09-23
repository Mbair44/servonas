-- Forward compatibility for installations that applied the first Search Console
-- migration before property discovery and cached reporting were added.
alter table public.business_google_search_console_connections
  add column if not exists refresh_token text,
  add column if not exists property_url text,
  add column if not exists available_properties jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'connected',
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists connected_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.business_google_search_console_connections
  drop constraint if exists business_google_search_console_connections_status_check;
alter table public.business_google_search_console_connections
  add constraint business_google_search_console_connections_status_check
  check (status in ('connected','property_selection_required','permission_denied','error','disconnected'));

create table if not exists public.business_google_search_console_rows (
  business_id uuid not null references public.businesses(id) on delete cascade,
  property_url text not null,
  report_date date not null,
  page_url text not null,
  query text,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric,
  position numeric,
  synced_at timestamptz not null default now(),
  primary key (business_id,property_url,report_date,page_url,query)
);

alter table public.business_google_search_console_rows
  add column if not exists property_url text,
  add column if not exists report_date date,
  add column if not exists page_url text,
  add column if not exists query text,
  add column if not exists clicks integer not null default 0,
  add column if not exists impressions integer not null default 0,
  add column if not exists ctr numeric,
  add column if not exists position numeric,
  add column if not exists synced_at timestamptz not null default now();

alter table public.business_google_search_console_connections enable row level security;
alter table public.business_google_search_console_rows enable row level security;
create index if not exists business_google_search_console_rows_page_idx
  on public.business_google_search_console_rows(business_id,page_url,report_date desc);
create index if not exists business_google_search_console_rows_property_idx
  on public.business_google_search_console_rows(business_id,property_url,report_date desc);
