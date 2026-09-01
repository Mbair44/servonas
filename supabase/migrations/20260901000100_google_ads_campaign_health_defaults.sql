begin;

alter table public.business_google_ads_campaigns
 add column if not exists bidding_strategy text not null default 'MAXIMIZE_CLICKS'
  check(bidding_strategy in('MAXIMIZE_CLICKS','MANUAL_CPC')),
 add column if not exists manual_cpc_bid_micros bigint
  check(manual_cpc_bid_micros is null or manual_cpc_bid_micros>=10000);

update public.business_google_ads_campaigns
set bidding_strategy = 'MAXIMIZE_CLICKS'
where bidding_strategy is distinct from 'MANUAL_CPC'
  and bidding_strategy is null;

notify pgrst,'reload schema';
commit;
