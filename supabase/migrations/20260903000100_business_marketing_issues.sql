begin;

create table if not exists public.business_marketing_issues(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 provider text not null check(provider in('google_ads','meta_ads')),
 integration_account_id text,
 issue_type text not null,
 severity text not null check(severity in('info','warning','critical')),
 title text not null,
 message text not null default '',
 recommended_action text,
 external_resource_type text,
 external_resource_id text,
 detected_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 resolved_at timestamptz,
 dismissed_at timestamptz,
 status text not null default 'active' check(status in('active','resolved','dismissed')),
 dedupe_key text not null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(jsonb_typeof(metadata)='object'),
 unique(business_id,dedupe_key)
);

create index if not exists business_marketing_issues_business_idx
 on public.business_marketing_issues(business_id,provider,status,severity,updated_at desc);

alter table public.business_marketing_issues enable row level security;

drop policy if exists "members read marketing issues" on public.business_marketing_issues;
create policy "members read marketing issues"
 on public.business_marketing_issues for select to authenticated
 using(public.is_business_member(business_id));

drop policy if exists "admins manage marketing issues" on public.business_marketing_issues;
create policy "admins manage marketing issues"
 on public.business_marketing_issues for all to authenticated
 using(public.has_business_role(business_id,array['owner','admin']))
 with check(public.has_business_role(business_id,array['owner','admin']));

alter table public.business_google_ads_connections
 add column if not exists last_issue_check_at timestamptz,
 add column if not exists last_issue_check_failed_at timestamptz,
 add column if not exists last_issue_check_error text;

comment on table public.business_marketing_issues is
 'Normalized tenant-scoped operational issues for external marketing integrations such as Google Ads.';
comment on column public.business_marketing_issues.dedupe_key is
 'Stable per-business issue key used to avoid creating duplicate issue and notification rows on every sync.';
comment on column public.business_google_ads_connections.last_issue_check_at is
 'Most recent successful Google Ads account and campaign issue check for this tenant connection.';
comment on column public.business_google_ads_connections.last_issue_check_failed_at is
 'Most recent failed Google Ads issue-check attempt.';

notify pgrst,'reload schema';
commit;
