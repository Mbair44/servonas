begin;

create table if not exists public.business_google_ads_beta_events(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 actor_user_id uuid references auth.users(id) on delete set null,
 campaign_id uuid references public.business_google_ads_campaigns(id) on delete set null,
 event_name text not null,
 metadata jsonb not null default '{}'::jsonb,
 occurred_at timestamptz not null default now(),
 check(jsonb_typeof(metadata)='object')
);

create index if not exists business_google_ads_beta_events_business_idx
 on public.business_google_ads_beta_events(business_id,occurred_at desc);

create table if not exists public.business_google_ads_beta_feedback(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 actor_user_id uuid references auth.users(id) on delete set null,
 rating text not null check(rating in('confused','neutral','successful')),
 feedback text not null default '',
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 check(char_length(feedback)<=2000),
 check(jsonb_typeof(metadata)='object')
);

create index if not exists business_google_ads_beta_feedback_business_idx
 on public.business_google_ads_beta_feedback(business_id,created_at desc);

alter table public.business_google_ads_beta_events enable row level security;
alter table public.business_google_ads_beta_feedback enable row level security;

drop policy if exists "members read google ads beta events" on public.business_google_ads_beta_events;
create policy "members read google ads beta events"
 on public.business_google_ads_beta_events for select to authenticated
 using(public.is_business_member(business_id));

drop policy if exists "admins create google ads beta events" on public.business_google_ads_beta_events;
create policy "admins create google ads beta events"
 on public.business_google_ads_beta_events for insert to authenticated
 with check(public.has_business_role(business_id,array['owner','admin']));

drop policy if exists "members read google ads beta feedback" on public.business_google_ads_beta_feedback;
create policy "members read google ads beta feedback"
 on public.business_google_ads_beta_feedback for select to authenticated
 using(public.is_business_member(business_id));

drop policy if exists "admins create google ads beta feedback" on public.business_google_ads_beta_feedback;
create policy "admins create google ads beta feedback"
 on public.business_google_ads_beta_feedback for insert to authenticated
 with check(public.has_business_role(business_id,array['owner','admin']));

comment on table public.business_google_ads_beta_events is
 'Servonas-managed beta adoption and workflow events for Google Ads setup, launch, and support analysis.';
comment on table public.business_google_ads_beta_feedback is
 'Lightweight workspace feedback collected during the Google Ads beta.';

notify pgrst,'reload schema';
commit;
