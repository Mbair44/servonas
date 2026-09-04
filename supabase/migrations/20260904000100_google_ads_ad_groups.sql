begin;

create table if not exists public.business_google_ads_ad_groups(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 campaign_id uuid not null references public.business_google_ads_campaigns(id) on delete cascade,
 service_id uuid references public.services(id) on delete set null,
 inventory_item_id uuid references public.inventory_items(id) on delete set null,
 google_ads_customer_id text,
 google_campaign_id text,
 google_ad_group_id text,
 ad_group_name text not null,
 status text not null default 'draft' check(status in('draft','published','paused','archived','failed')),
 destination_url text not null,
 keywords jsonb not null default '[]'::jsonb,
 negative_keywords jsonb not null default '[]'::jsonb,
 ads jsonb not null default '[]'::jsonb,
 source text not null default 'servonas' check(source in('servonas','google_import')),
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 check(jsonb_typeof(keywords)='array'),
 check(jsonb_typeof(negative_keywords)='array'),
 check(jsonb_typeof(ads)='array')
);

create index if not exists business_google_ads_ad_groups_campaign_idx
 on public.business_google_ads_ad_groups(campaign_id,status,updated_at desc);

alter table public.business_google_ads_ad_groups enable row level security;

drop policy if exists "members read google ads ad groups" on public.business_google_ads_ad_groups;
create policy "members read google ads ad groups"
 on public.business_google_ads_ad_groups for select to authenticated
 using(public.is_business_member(business_id));

drop policy if exists "admins manage google ads ad groups" on public.business_google_ads_ad_groups;
create policy "admins manage google ads ad groups"
 on public.business_google_ads_ad_groups for all to authenticated
 using(public.has_business_role(business_id,array['owner','admin']))
 with check(public.has_business_role(business_id,array['owner','admin']));

comment on table public.business_google_ads_ad_groups is
 'Tenant-scoped Servonas ad-group drafts and Google ad-group references for a published Google Ads campaign.';

notify pgrst,'reload schema';
commit;
