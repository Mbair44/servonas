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
