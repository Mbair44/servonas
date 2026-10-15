export const jobMarketingSources=["dashboard","meta_ads","google_ads","google_business_profile","organic","organic_social","referral","direct","unknown"] as const;
export type JobMarketingSource=typeof jobMarketingSources[number];

export const jobMarketingSourceLabels:Record<JobMarketingSource,string>={
 dashboard:"Dashboard / manual entry",
 meta_ads:"Meta Ads",
 google_ads:"Google Ads",
 google_business_profile:"Google Business Profile",
 organic:"Organic Search",
 organic_social:"Organic Social",
 referral:"Referral",
 direct:"Direct",
 unknown:"Other / Unknown",
};

export function jobMarketingSource(value:unknown):JobMarketingSource|null{
 return typeof value==="string"&&jobMarketingSources.includes(value as JobMarketingSource)?value as JobMarketingSource:null;
}
