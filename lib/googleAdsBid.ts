export function googleAdsBidDollarsToMicros(value: unknown) {
 const dollars = typeof value === "string" ? value.trim() : "";
 if (!/^\d+(?:\.\d{1,2})?$/.test(dollars)) return null;
 const numeric = Number(dollars);
 return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 1_000_000) : null;
}

export function googleAdsRecommendedAdGroupMaxCpcMicros(input:{currentBidMicros?:number|null;campaignBidMicros?:number|null;costMicros?:number|null;clicks?:number|null;dailyBudgetMicros?:number|null}){
 const positive=(value:number|null|undefined)=>Number.isFinite(value)&&Number(value)>0?Number(value):0;
 const current=positive(input.currentBidMicros),campaign=positive(input.campaignBidMicros),clicks=Math.max(0,Math.floor(positive(input.clicks))),cost=positive(input.costMicros),dailyBudget=positive(input.dailyBudgetMicros);
 const observedAverage=clicks>=3&&cost>0?cost/clicks:0;
 const baseline=observedAverage>0?Math.max(current,observedAverage*1.25):current||campaign||2_000_000;
 const budgetCap=dailyBudget>0?Math.max(1_000_000,dailyBudget*.35):25_000_000;
 return Math.round(Math.min(25_000_000,budgetCap,Math.max(500_000,baseline))/100_000)*100_000;
}
