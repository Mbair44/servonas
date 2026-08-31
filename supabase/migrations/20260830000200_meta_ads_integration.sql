begin;

create extension if not exists supabase_vault with schema vault;

create table if not exists public.business_ad_platform_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('meta')),
  connected_by uuid references auth.users(id) on delete set null,
  external_user_id text,
  external_business_manager_id text,
  external_account_id text,
  external_account_name text,
  credential_secret_id uuid,
  token_expires_at timestamptz,
  scopes_granted text[] not null default '{}'::text[],
  status text not null default 'connected_never_synced'
    check (status in ('not_connected','connected_never_synced','syncing','connected_synced_no_data','connected_with_data','sync_error','authorization_expired')),
  connected_at timestamptz,
  last_successful_sync_at timestamptz,
  last_sync_attempt_at timestamptz,
  last_sync_error text,
  last_sync_rows integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider)
);

create index if not exists business_ad_platform_connections_business_provider_idx
  on public.business_ad_platform_connections(business_id, provider);

create table if not exists public.business_ad_platform_daily_performance (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('meta')),
  external_account_id text not null,
  report_date date not null,
  campaign_id text,
  campaign_name text,
  campaign_status text,
  adset_id text,
  adset_name text,
  adset_status text,
  ad_id text,
  ad_name text,
  ad_status text,
  spend_amount numeric(18,6) not null default 0,
  currency text not null default 'USD',
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  landing_page_views bigint not null default 0,
  ctr numeric(12,6),
  cpc_amount numeric(18,6),
  cpm_amount numeric(18,6),
  frequency numeric(12,6),
  leads bigint not null default 0,
  purchase_value_amount numeric(18,6) not null default 0,
  raw_actions jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(raw_actions) = 'array'),
  check (jsonb_typeof(raw_payload) = 'object'),
  unique (business_id, provider, external_account_id, report_date, campaign_id, adset_id, ad_id)
);

create index if not exists business_ad_platform_daily_performance_business_idx
  on public.business_ad_platform_daily_performance(business_id, provider, report_date desc);

create table if not exists public.business_ad_platform_sync_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('meta')),
  ad_platform_connection_id uuid references public.business_ad_platform_connections(id) on delete cascade,
  external_account_id text,
  stage text not null,
  outcome text not null check (outcome in ('started','succeeded','failed')),
  rows_synced integer,
  error_category text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists business_ad_platform_sync_events_business_idx
  on public.business_ad_platform_sync_events(business_id, provider, created_at desc);

alter table public.business_ad_platform_connections enable row level security;
alter table public.business_ad_platform_daily_performance enable row level security;
alter table public.business_ad_platform_sync_events enable row level security;

drop policy if exists "members read ad platform performance" on public.business_ad_platform_daily_performance;
create policy "members read ad platform performance"
  on public.business_ad_platform_daily_performance for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "members read ad platform sync events" on public.business_ad_platform_sync_events;
create policy "members read ad platform sync events"
  on public.business_ad_platform_sync_events for select to authenticated
  using (public.is_business_member(business_id));

revoke all on public.business_ad_platform_connections from anon, authenticated;
revoke insert, update, delete on public.business_ad_platform_daily_performance from anon, authenticated;
revoke insert, update, delete on public.business_ad_platform_sync_events from anon, authenticated;

create or replace function public.store_ad_platform_access_token(
  p_business_id uuid,
  p_provider text,
  p_access_token text
) returns uuid
language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare
  v_connection public.business_ad_platform_connections%rowtype;
  v_secret_id uuid;
begin
  if p_provider not in ('meta') then
    raise exception using errcode='22023', message='Unsupported ad provider.';
  end if;
  if p_access_token is null or length(p_access_token) < 20 then
    raise exception using errcode='22023', message='Invalid provider credential.';
  end if;

  select * into v_connection
  from public.business_ad_platform_connections
  where business_id = p_business_id and provider = p_provider
  for update;

  if not found then
    raise exception using errcode='P0002', message='Ad platform connection not found.';
  end if;

  if v_connection.credential_secret_id is null then
    v_secret_id := vault.create_secret(p_access_token, 'servonas_' || p_provider || '_' || p_business_id::text, 'Servonas tenant ad platform access token');
  else
    v_secret_id := v_connection.credential_secret_id;
    perform vault.update_secret(v_secret_id, p_access_token, 'servonas_' || p_provider || '_' || p_business_id::text, 'Servonas tenant ad platform access token');
  end if;

  update public.business_ad_platform_connections
  set credential_secret_id = v_secret_id,
      updated_at = now()
  where id = v_connection.id;

  return v_secret_id;
end;$$;

create or replace function public.get_ad_platform_access_token(
  p_business_id uuid,
  p_provider text
) returns text
language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare
  v_secret text;
  v_secret_id uuid;
begin
  if p_provider not in ('meta') then
    return null;
  end if;

  select credential_secret_id into v_secret_id
  from public.business_ad_platform_connections
  where business_id = p_business_id and provider = p_provider;

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id = v_secret_id;

  return v_secret;
end;$$;

create or replace function public.delete_ad_platform_access_token(
  p_business_id uuid,
  p_provider text
) returns void
language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare
  v_connection public.business_ad_platform_connections%rowtype;
begin
  select * into v_connection
  from public.business_ad_platform_connections
  where business_id = p_business_id and provider = p_provider
  for update;

  if not found then
    return;
  end if;

  if v_connection.credential_secret_id is not null then
    delete from vault.secrets where id = v_connection.credential_secret_id;
  end if;

  update public.business_ad_platform_connections
  set credential_secret_id = null,
      updated_at = now()
  where id = v_connection.id;
end;$$;

revoke all on function public.store_ad_platform_access_token(uuid,text,text) from public, anon, authenticated;
revoke all on function public.get_ad_platform_access_token(uuid,text) from public, anon, authenticated;
revoke all on function public.delete_ad_platform_access_token(uuid,text) from public, anon, authenticated;
grant execute on function public.store_ad_platform_access_token(uuid,text,text) to service_role;
grant execute on function public.get_ad_platform_access_token(uuid,text) to service_role;
grant execute on function public.delete_ad_platform_access_token(uuid,text) to service_role;

comment on table public.business_ad_platform_connections is
  'Private tenant-scoped ad platform connections. Only opaque Vault references may store provider credentials.';
comment on table public.business_ad_platform_daily_performance is
  'Tenant-scoped provider-normalized daily ad performance used for spend reporting and ROAS.';

notify pgrst, 'reload schema';
commit;
