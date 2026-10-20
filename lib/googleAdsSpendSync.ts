import {getSupabaseAdmin} from "./supabaseAdmin";
import {fetchGoogleAdsDailyCampaignMetrics,loadTenantGoogleAdsAccess} from "./googleAdsManagement";
import {adSpendSyncRange} from "./adSpendSyncRange";

export async function syncGoogleAdsSpend(input:{businessId:string;forceFull?:boolean;dateFrom?:string;dateThrough?:string}){
 const db=getSupabaseAdmin();if(!db)throw new Error("Google Ads spend sync is unavailable.");
 const {data:connection,error}=await db.from("business_google_ads_connections").select("google_ads_customer_id,login_customer_id,last_spend_sync_at,status").eq("business_id",input.businessId).maybeSingle();
 if(error)throw new Error("Google Ads connection could not be loaded.");
 if(!connection?.google_ads_customer_id||connection.status==="disconnected")throw new Error("Google Ads is not connected to a selected customer account.");
 const access=await loadTenantGoogleAdsAccess(input.businessId);if(!access?.customerId)throw new Error("Google Ads customer access is unavailable.");
 const now=new Date(),days=input.forceFull||!connection.last_spend_sync_at?30:7,{from,to}=adSpendSyncRange({dateFrom:input.dateFrom,dateThrough:input.dateThrough,fallbackDays:days,today:now});
 await db.from("business_google_ads_connections").update({last_spend_sync_attempt_at:now.toISOString(),last_spend_sync_error:null}).eq("business_id",input.businessId);
 try{
  const rows=await fetchGoogleAdsDailyCampaignMetrics({accessToken:access.accessToken,customerId:access.customerId,loginCustomerId:access.loginCustomerId,dateFrom:from,dateTo:to,businessId:input.businessId});
  const syncedAt=new Date().toISOString(),currencies=[...new Set(rows.map(row=>row.currencyCode.trim().toUpperCase()).filter(Boolean))];
  if(currencies.length>1)throw new Error("Google Ads returned multiple currencies for one connected account.");
  if(rows.length&&!currencies.length)throw new Error("Google Ads did not return an account currency for campaign spend.");
  // An empty campaign response does establish coverage, but not a currency. Keep
  // CAC unavailable rather than labelling an unverified amount as dollars.
  const currency=currencies[0]??"";
  const upserts=rows.map(row=>({business_id:input.businessId,provider:"google_ads",external_account_id:String(access.customerId),report_date:row.date,campaign_id:row.campaignId,campaign_name:row.campaignName,campaign_status:row.campaignStatus,adset_id:"__campaign__",adset_name:null,adset_status:null,ad_id:"__campaign__",ad_name:null,ad_status:null,spend_amount:row.costMicros/1_000_000,currency,impressions:row.impressions,reach:0,clicks:row.clicks,link_clicks:row.clicks,landing_page_views:0,raw_actions:[],raw_payload:{source:"google_ads_campaign_daily"},synced_at:syncedAt,updated_at:syncedAt}));
  if(upserts.length){const {error:writeError}=await db.from("business_ad_platform_daily_performance").upsert(upserts,{onConflict:"business_id,provider,external_account_id,report_date,campaign_id,adset_id,ad_id"});if(writeError)throw new Error(`Google Ads spend save failed: ${writeError.message}`);}
  const coverage=[] as {business_id:string;provider:"google_ads";report_date:string;currency:string;synced_at:string}[];for(let cursor=from;cursor<=to;){coverage.push({business_id:input.businessId,provider:"google_ads",report_date:cursor,currency,synced_at:syncedAt});const next=new Date(`${cursor}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);cursor=next.toISOString().slice(0,10);}
  const {error:coverageError}=await db.from("business_ad_platform_spend_coverage").upsert(coverage,{onConflict:"business_id,provider,report_date"});if(coverageError)throw new Error(`Google Ads spend coverage save failed: ${coverageError.message}`);
  await db.from("business_google_ads_connections").update({last_spend_sync_at:syncedAt,last_spend_sync_attempt_at:syncedAt,last_spend_sync_error:null,last_spend_sync_rows:upserts.length,updated_at:syncedAt}).eq("business_id",input.businessId);
  return {rowsSynced:upserts.length,from,to};
 }catch(error){const message=error instanceof Error?error.message:"Google Ads spend sync failed.";await db.from("business_google_ads_connections").update({last_spend_sync_error:message.slice(0,500),updated_at:new Date().toISOString()}).eq("business_id",input.businessId);throw error;}
}
