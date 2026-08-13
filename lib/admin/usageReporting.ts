import {getSupabaseAdmin} from "../supabaseAdmin.ts";

export type AdminUsageView="overview"|"twilio"|"ai";
export type BusinessUsageRow={
 id:string;name:string;slug:string;
 access:{ai:boolean;twilio:boolean};twilioStatus:{provisioning:string;activation:string;hasSubaccount:boolean};
 lifecycle:"active"|"deactivated";website:{managed:boolean;monthlyCostCents:number;cost:number};
 twilio:{messageCount:number;segments:number;cost:number;currency:string|null;unfinalized:number};
 ai:{requestCount:number;inputTokens:number;cachedInputTokens:number;outputTokens:number;totalTokens:number;cost:number;unpriced:number};
};

const integer=(value:unknown)=>Math.max(0,Number(value??0));
export async function getAdminUsageReport(period:string,periods=[period]){
 const db=getSupabaseAdmin();if(!db)throw new Error("Platform administration is unavailable.");
 const periodStart=`${period}-01`;
 const starts=periods.map(value=>`${value}-01`),[businessResult,twilioResult,aiResult,aiAccessResult,twilioAccessResult,twilioAccountResult,twilioActivationResult,websiteResult,websitePeriodsResult,stateResult]=await Promise.all([
  db.from("businesses").select("id,name,slug").eq("is_deleted",false).order("name"),
  db.from("platform_business_twilio_monthly_usage").select("*").in("billing_period_start",starts),
  db.from("platform_business_ai_monthly_usage").select("*").in("billing_period_start",starts),
  db.from("business_ai_assistant_access").select("business_id,enabled"),
  db.from("business_twilio_access").select("business_id,enabled"),
  db.from("business_twilio_accounts").select("business_id,provisioning_status,twilio_subaccount_sid"),
  db.from("twilio_tenant_activations").select("business_id,status"),
  db.from("business_website_management").select("business_id,enabled,monthly_cost_cents"),
  db.from("business_website_management_periods").select("business_id,billing_period_start,managed,cost_cents").in("billing_period_start",starts),
  db.from("platform_business_admin_state").select("business_id,lifecycle_status")
 ]);
 const error=businessResult.error||twilioResult.error||aiResult.error||aiAccessResult.error||twilioAccessResult.error||twilioAccountResult.error||twilioActivationResult.error||websiteResult.error||websitePeriodsResult.error||stateResult.error;if(error)throw new Error("Usage and access reporting is unavailable. Apply the latest database migration.");
 const grouped=(rows:any[])=>rows.reduce((map:Map<string,any[]>,row:any)=>map.set(row.business_id,[...(map.get(row.business_id)??[]),row]),new Map<string,any[]>()),twilioByBusiness=grouped(twilioResult.data??[]),aiByBusiness=grouped(aiResult.data??[]),websitePeriodsByBusiness=grouped(websitePeriodsResult.data??[]);
 const aiAccess=new Map((aiAccessResult.data??[]).map((row:any)=>[row.business_id,row.enabled===true])),twilioAccess=new Map((twilioAccessResult.data??[]).map((row:any)=>[row.business_id,row.enabled===true])),twilioAccounts=new Map((twilioAccountResult.data??[]).map((row:any)=>[row.business_id,row])),twilioActivations=new Map((twilioActivationResult.data??[]).map((row:any)=>[row.business_id,row])),websiteAccess=new Map((websiteResult.data??[]).map((row:any)=>[row.business_id,row])),states=new Map((stateResult.data??[]).map((row:any)=>[row.business_id,row.lifecycle_status]));
 const businesses:BusinessUsageRow[]=(businessResult.data??[]).map((business:any)=>{const twilioRows:any[]=twilioByBusiness.get(business.id)??[],aiRows:any[]=aiByBusiness.get(business.id)??[],account:any=twilioAccounts.get(business.id),activation:any=twilioActivations.get(business.id),website:any=websiteAccess.get(business.id),websitePeriods:any[]=websitePeriodsByBusiness.get(business.id)??[];return{
  ...business,
  access:{ai:aiAccess.get(business.id)===true,twilio:twilioAccess.get(business.id)===true},twilioStatus:{provisioning:account?.provisioning_status??"not started",activation:activation?.status??"not started",hasSubaccount:Boolean(account?.twilio_subaccount_sid)},
  lifecycle:states.get(business.id)==="deactivated"?"deactivated":"active",website:{managed:website?.enabled===true,monthlyCostCents:integer(website?.monthly_cost_cents),cost:websitePeriods.reduce((sum,row)=>sum+Number(row.managed?row.cost_cents:0),0)/100},
  twilio:{messageCount:twilioRows.reduce((sum,row)=>sum+integer(row.message_count),0),segments:twilioRows.reduce((sum,row)=>sum+integer(row.outbound_sms_segments),0),cost:twilioRows.reduce((sum,row)=>sum+Number(row.provider_cost??0),0),currency:twilioRows.find(row=>row.provider_cost_currency)?.provider_cost_currency??null,unfinalized:twilioRows.reduce((sum,row)=>sum+integer(row.unfinalized_message_count),0)},
  ai:{requestCount:aiRows.reduce((sum,row)=>sum+integer(row.request_count),0),inputTokens:aiRows.reduce((sum,row)=>sum+integer(row.input_tokens),0),cachedInputTokens:aiRows.reduce((sum,row)=>sum+integer(row.cached_input_tokens),0),outputTokens:aiRows.reduce((sum,row)=>sum+integer(row.output_tokens),0),totalTokens:aiRows.reduce((sum,row)=>sum+integer(row.total_tokens),0),cost:aiRows.reduce((sum,row)=>sum+Number(row.provider_cost_usd??0),0),unpriced:aiRows.reduce((sum,row)=>sum+integer(row.unpriced_request_count),0)}
 };});
 return{period,periodStart,periods,businesses,totals:businesses.reduce((total,row)=>({twilioCost:total.twilioCost+row.twilio.cost,twilioSegments:total.twilioSegments+row.twilio.segments,twilioMessages:total.twilioMessages+row.twilio.messageCount,twilioUnfinalized:total.twilioUnfinalized+row.twilio.unfinalized,aiCost:total.aiCost+row.ai.cost,aiRequests:total.aiRequests+row.ai.requestCount,aiTokens:total.aiTokens+row.ai.totalTokens,aiUnpriced:total.aiUnpriced+row.ai.unpriced,websiteCost:total.websiteCost+row.website.cost}),{twilioCost:0,twilioSegments:0,twilioMessages:0,twilioUnfinalized:0,aiCost:0,aiRequests:0,aiTokens:0,aiUnpriced:0,websiteCost:0})};
}
