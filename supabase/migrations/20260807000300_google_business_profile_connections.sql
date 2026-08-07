begin;

create table if not exists public.business_google_profile_connections(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 connected_by uuid references auth.users(id) on delete set null,
 refresh_token text not null,
 google_account_id text not null,
 google_location_id text not null,
 location_title text,
 status text not null default 'connected' check(status in('connected','reauthorization_required')),
 connected_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.business_google_profile_connections enable row level security;
-- No client policies: OAuth credentials are available only through service-role server code.

comment on table public.business_google_profile_connections is
 'Private OAuth connection to a tenant-owned Google Business Profile. Refresh tokens must never be exposed to clients.';

notify pgrst, 'reload schema';
commit;
