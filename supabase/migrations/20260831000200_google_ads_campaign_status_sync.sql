alter table public.business_google_ads_campaigns
 add column if not exists google_campaign_resource_name text,
 add column if not exists google_campaign_status text,
 add column if not exists google_campaign_primary_status text,
 add column if not exists google_campaign_primary_status_reasons jsonb not null default '[]'::jsonb;
