import type {SupabaseClient} from "@supabase/supabase-js";
import type {MarketingSource,MarketingSpendProvider} from "./marketingAttribution.ts";
import {fetchGoogleAdsCampaignMetrics,loadTenantGoogleAdsAccess} from "./googleAdsManagement.ts";

export async function loadGoogleAdsSpendForRange(input:{businessId:string;from:string;to:string}){
 try{
  const access=await loadTenantGoogleAdsAccess(input.businessId);
  if(!access?.customerId)return null;
  const metrics=await fetchGoogleAdsCampaignMetrics({accessToken:access.accessToken,customerId:access.customerId,dateFrom:input.from.slice(0,10),dateTo:input.to.slice(0,10),businessId:input.businessId});
  return Math.round(metrics.reduce((sum,row)=>sum+Math.max(0,Number(row.costMicros??0)),0)/10_000);
 }catch{
  return null;
 }
}

export class GoogleAdsSpendProvider implements MarketingSpendProvider{
 constructor(private readonly db:SupabaseClient){}

 async getSpendBySource(input:{businessId:string;from:string;to:string}):Promise<Partial<Record<MarketingSource,number|null>>>{
  const spendCents=await loadGoogleAdsSpendForRange(input);
  return spendCents!=null?{google_ads:spendCents}:{};
 }
}

export class MultiPlatformSpendProvider implements MarketingSpendProvider{
 constructor(private readonly db:SupabaseClient){}

 async getSpendBySource(input:{businessId:string;from:string;to:string}):Promise<Partial<Record<MarketingSource,number|null>>>{
  const [google,meta]=await Promise.all([
   new GoogleAdsSpendProvider(this.db).getSpendBySource(input),
   this.db
    .from("business_ad_platform_daily_performance")
    .select("spend_amount")
    .eq("business_id",input.businessId)
    .eq("provider","meta")
    .gte("report_date",input.from.slice(0,10))
    .lt("report_date",input.to.slice(0,10)),
  ]);
  const metaSpendCents=((meta.data??[]) as Array<{spend_amount:number|string|null}>).reduce((sum,row)=>sum+Math.max(0,Math.round(Number(row.spend_amount??0)*100)),0);
  return metaSpendCents>0?{...google,facebook:metaSpendCents}:{...google};
 }
}
