begin;

create table if not exists public.business_google_ads_connections(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 connected_by uuid references auth.users(id) on delete set null,
 refresh_token text not null,
 google_ads_customer_id text,
 accessible_customer_ids text[] not null default '{}'::text[],
 accessible_customer_labels jsonb not null default '{}'::jsonb,
 status text not null default 'pending_selection' check(status in('pending_selection','connected','reauthorization_required','disconnected')),
 connected_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.business_google_ads_campaigns(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 service_id uuid references public.services(id) on delete set null,
 inventory_item_id uuid references public.inventory_items(id) on delete set null,
 google_ads_customer_id text not null,
 google_campaign_id text,
 google_campaign_budget_resource_name text,
 google_ad_group_id text,
 campaign_name text not null,
 ad_group_name text not null,
 destination_url text not null,
 status text not null default 'draft' check(status in('draft','publishing','published','paused','archived','failed')),
 source text not null default 'servonas' check(source in('servonas','google_import')),
 daily_budget_micros bigint not null check(daily_budget_micros>=1000000),
 monthly_budget_estimate_cents integer not null default 0 check(monthly_budget_estimate_cents>=0),
 geo_target_type text not null default 'service_area' check(geo_target_type in('service_area','cities','zip_codes','radius')),
 geo_target_summary text not null,
 geo_target_config jsonb not null default '{}'::jsonb,
 keywords jsonb not null default '[]'::jsonb,
 negative_keywords jsonb not null default '[]'::jsonb,
 headlines jsonb not null default '[]'::jsonb,
 descriptions jsonb not null default '[]'::jsonb,
 last_sync_at timestamptz,
 last_error text,
 last_published_at timestamptz,
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 check(jsonb_typeof(keywords)='array'),
 check(jsonb_typeof(negative_keywords)='array'),
 check(jsonb_typeof(headlines)='array'),
 check(jsonb_typeof(descriptions)='array'),
 check(jsonb_typeof(geo_target_config)='object')
);

create index if not exists business_google_ads_campaigns_business_idx
 on public.business_google_ads_campaigns(business_id,status,updated_at desc);

create table if not exists public.business_google_ads_audit_log(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid references public.business_google_ads_campaigns(id) on delete cascade,
 actor_user_id uuid references auth.users(id) on delete set null,
 event_type text not null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 check(jsonb_typeof(metadata)='object')
);

create index if not exists business_google_ads_audit_log_business_idx
 on public.business_google_ads_audit_log(business_id,created_at desc);

alter table public.business_google_ads_connections enable row level security;
alter table public.business_google_ads_campaigns enable row level security;
alter table public.business_google_ads_audit_log enable row level security;

drop policy if exists "members read google ads campaigns" on public.business_google_ads_campaigns;
create policy "members read google ads campaigns"
 on public.business_google_ads_campaigns for select to authenticated
 using(public.is_business_member(business_id));

drop policy if exists "admins manage google ads campaigns" on public.business_google_ads_campaigns;
create policy "admins manage google ads campaigns"
 on public.business_google_ads_campaigns for all to authenticated
 using(public.has_business_role(business_id,array['owner','admin']))
 with check(public.has_business_role(business_id,array['owner','admin']));

drop policy if exists "members read google ads audit log" on public.business_google_ads_audit_log;
create policy "members read google ads audit log"
 on public.business_google_ads_audit_log for select to authenticated
 using(public.is_business_member(business_id));

drop policy if exists "admins create google ads audit log" on public.business_google_ads_audit_log;
create policy "admins create google ads audit log"
 on public.business_google_ads_audit_log for insert to authenticated
 with check(public.has_business_role(business_id,array['owner','admin']));

revoke all on public.business_google_ads_connections from anon,authenticated;
comment on table public.business_google_ads_connections is
 'Private tenant-scoped Google Ads OAuth credentials and selected customer IDs. Refresh tokens must remain server-only.';
comment on table public.business_google_ads_campaigns is
 'Servonas-managed simplified Google Ads campaign drafts and published campaign references.';
comment on table public.business_google_ads_audit_log is
 'Tenant-scoped audit trail for Google Ads connection and campaign changes initiated from Servonas.';

notify pgrst,'reload schema';
commit;
