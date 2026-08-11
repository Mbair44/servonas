import {getSupabaseAdmin} from "../supabaseAdmin.ts";

export type AdminUsageView="overview"|"twilio"|"ai";
export type BusinessUsageRow={
 id:string;name:string;slug:string;
 twilio:{messageCount:number;segments:number;cost:number;currency:string|null;unfinalized:number};
 ai:{requestCount:number;inputTokens:number;cachedInputTokens:number;outputTokens:number;totalTokens:number;cost:number;unpriced:number};
};

const integer=(value:unknown)=>Math.max(0,Number(value??0));
export async function getAdminUsageReport(period:string){
 const db=getSupabaseAdmin();if(!db)throw new Error("Platform administration is unavailable.");
 const periodStart=`${period}-01`;
 const [businessResult,twilioResult,aiResult]=await Promise.all([
  db.from("businesses").select("id,name,slug").eq("is_deleted",false).order("name"),
  db.from("platform_business_twilio_monthly_usage").select("*").eq("billing_period_start",periodStart),
  db.from("platform_business_ai_monthly_usage").select("*").eq("billing_period_start",periodStart)
 ]);
 const error=businessResult.error||twilioResult.error||aiResult.error;if(error)throw new Error("Usage reporting is unavailable. Apply the latest database migration.");
 const twilioByBusiness=new Map((twilioResult.data??[]).map((row:any)=>[row.business_id,row]));
 const aiByBusiness=new Map((aiResult.data??[]).map((row:any)=>[row.business_id,row]));
 const businesses:BusinessUsageRow[]=(businessResult.data??[]).map((business:any)=>{const twilio:any=twilioByBusiness.get(business.id),ai:any=aiByBusiness.get(business.id);return{
  ...business,
  twilio:{messageCount:integer(twilio?.message_count),segments:integer(twilio?.outbound_sms_segments),cost:Number(twilio?.provider_cost??0),currency:twilio?.provider_cost_currency??null,unfinalized:integer(twilio?.unfinalized_message_count)},
  ai:{requestCount:integer(ai?.request_count),inputTokens:integer(ai?.input_tokens),cachedInputTokens:integer(ai?.cached_input_tokens),outputTokens:integer(ai?.output_tokens),totalTokens:integer(ai?.total_tokens),cost:Number(ai?.provider_cost_usd??0),unpriced:integer(ai?.unpriced_request_count)}
 };});
 return{period,periodStart,businesses,totals:businesses.reduce((total,row)=>({twilioCost:total.twilioCost+row.twilio.cost,twilioSegments:total.twilioSegments+row.twilio.segments,twilioMessages:total.twilioMessages+row.twilio.messageCount,twilioUnfinalized:total.twilioUnfinalized+row.twilio.unfinalized,aiCost:total.aiCost+row.ai.cost,aiRequests:total.aiRequests+row.ai.requestCount,aiTokens:total.aiTokens+row.ai.totalTokens,aiUnpriced:total.aiUnpriced+row.ai.unpriced}),{twilioCost:0,twilioSegments:0,twilioMessages:0,twilioUnfinalized:0,aiCost:0,aiRequests:0,aiTokens:0,aiUnpriced:0})};
}
