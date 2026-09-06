alter table public.business_google_ads_ad_groups
 add column if not exists cpc_bid_micros bigint
 check(cpc_bid_micros is null or cpc_bid_micros>=10000);

update public.business_google_ads_ad_groups ad_group
set cpc_bid_micros=campaign.manual_cpc_bid_micros
from public.business_google_ads_campaigns campaign
where campaign.id=ad_group.campaign_id
 and campaign.bidding_strategy='MANUAL_CPC'
 and ad_group.cpc_bid_micros is null;

notify pgrst,'reload schema';
