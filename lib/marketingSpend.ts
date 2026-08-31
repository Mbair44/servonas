import type {SupabaseClient} from "@supabase/supabase-js";
import type {MarketingSource,MarketingSpendProvider} from "./marketingAttribution.ts";

export class GoogleAdsSpendProvider implements MarketingSpendProvider{
 constructor(private readonly db:SupabaseClient){}

 async getSpendBySource(input:{businessId:string;from:string;to:string}):Promise<Partial<Record<MarketingSource,number|null>>>{
  const {data}=await this.db
   .from("business_google_ads_campaigns")
   .select("monthly_budget_estimate_cents,status")
   .eq("business_id",input.businessId)
   .in("status",["published","paused"]);
  const spendCents=(data??[]).reduce((sum,row)=>sum+Math.max(0,Number(row.monthly_budget_estimate_cents??0)),0);
  return spendCents>0?{google_ads:spendCents}:{}; 
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
