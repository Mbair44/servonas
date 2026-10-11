import type {SupabaseClient} from "@supabase/supabase-js";
import type {MarketingSource,MarketingSpendProvider} from "./marketingAttribution.ts";
import {getSupabaseAdmin} from "./supabaseAdmin";

export async function loadGoogleAdsSpendForRange(input:{businessId:string;from:string;to:string}){
 const db=getSupabaseAdmin();if(!db)return null;
 const [result,connection]=await Promise.all([
  db.from("business_ad_platform_daily_performance").select("spend_amount,currency").eq("business_id",input.businessId).eq("provider","google_ads").gte("report_date",input.from.slice(0,10)).lt("report_date",input.to.slice(0,10)),
  db.from("business_google_ads_connections").select("last_spend_sync_at,last_spend_sync_error").eq("business_id",input.businessId).maybeSingle(),
 ]);
 if(result.error||connection.error||!connection.data?.last_spend_sync_at||connection.data.last_spend_sync_error)return null;const currencies=new Set((result.data??[]).map(row=>String(row.currency??"USD").toUpperCase()));if(currencies.size!==1||!currencies.has("USD"))return null;
 return Math.round((result.data??[]).reduce((sum,row)=>sum+Math.max(0,Number(row.spend_amount??0)),0)*100);
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
  return metaSpendCents>0?{...google,meta_ads:metaSpendCents}:{...google};
 }
}
