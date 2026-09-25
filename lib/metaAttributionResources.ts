import type {SupabaseClient} from "@supabase/supabase-js";
import type {MetaPerformanceNameRow} from "./marketingAttribution.ts";

/** Resource identity is tenant-scoped and independent of the report's spend window. */
export async function loadMetaAttributionResources(db:SupabaseClient,businessId:string){
 const rows=new Map<string,MetaPerformanceNameRow>();
 const pageSize=1000;
 for(let offset=0;;offset+=pageSize){
  const result=await db.from("business_ad_platform_daily_performance")
   .select("campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name")
   .eq("business_id",businessId).eq("provider","meta")
   .order("report_date",{ascending:false}).order("id").range(offset,offset+pageSize-1);
  if(result.error)return {rows:[] as MetaPerformanceNameRow[],available:false};
  const page=(result.data??[]) as MetaPerformanceNameRow[];
  for(const row of page){
   const key=JSON.stringify([row.campaign_id,row.adset_id,row.ad_id]);
   if(!rows.has(key))rows.set(key,row);
  }
  if(page.length<pageSize)return {rows:[...rows.values()],available:true};
 }
}
