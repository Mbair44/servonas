create table if not exists public.business_google_search_console_connections (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 refresh_token text not null,
 property_url text,
 available_properties jsonb not null default '[]'::jsonb,
 status text not null default 'connected' check (status in ('connected','property_selection_required','permission_denied','error','disconnected')),
 last_synced_at timestamptz,
 last_error_code text,
 last_error_message text,
 connected_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.business_google_search_console_rows (
 business_id uuid not null references public.businesses(id) on delete cascade,
 property_url text not null, report_date date not null, page_url text not null, query text, clicks integer not null default 0, impressions integer not null default 0, ctr numeric, position numeric, synced_at timestamptz not null default now(),
 primary key (business_id,property_url,report_date,page_url,query)
);
alter table public.business_google_search_console_connections enable row level security;
alter table public.business_google_search_console_rows enable row level security;
create index if not exists business_google_search_console_rows_page_idx on public.business_google_search_console_rows(business_id,page_url,report_date desc);
