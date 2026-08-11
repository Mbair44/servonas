import {getSupabaseAdmin} from "../supabaseAdmin.ts";
import type {ProviderUsage} from "./provider.ts";

const monthStart=(value:string)=>`${value.slice(0,7)}-01`;
const cost=(tokens:number,rate:number)=>Number(((tokens*rate)/1_000_000).toFixed(8));

export async function recordAssistantProviderUsage(input:{
 businessId:string;
 userId:string;
 conversationId:string;
 usage:ProviderUsage;
}){
 const db=getSupabaseAdmin();
 if(!db)return;
 const occurredAt=input.usage.occurredAt??new Date().toISOString();
 const pricingModels=[input.usage.model,input.usage.model.replace(/-\d{4}-\d{2}-\d{2}$/u,"")].filter((value,index,values)=>values.indexOf(value)===index);
 const {data:rate}=await db.from("ai_model_pricing")
  .select("id,input_usd_per_million_tokens,cached_input_usd_per_million_tokens,output_usd_per_million_tokens,effective_from,effective_to,source_url")
  .eq("provider",input.usage.provider).in("model",pricingModels)
  .lte("effective_from",occurredAt).or(`effective_to.is.null,effective_to.gt.${occurredAt}`)
  .order("effective_from",{ascending:false}).limit(1).maybeSingle();
 const cached=Math.min(input.usage.cachedInputTokens,input.usage.inputTokens);
 const uncached=Math.max(0,input.usage.inputTokens-cached);
 const inputCost=rate?cost(uncached,Number(rate.input_usd_per_million_tokens)):null;
 const cachedCost=rate?cost(cached,Number(rate.cached_input_usd_per_million_tokens)):null;
 const outputCost=rate?cost(input.usage.outputTokens,Number(rate.output_usd_per_million_tokens)):null;
 const values={
  business_id:input.businessId,user_id:input.userId,conversation_id:input.conversationId,
  provider:input.usage.provider,model:input.usage.model,provider_request_id:input.usage.requestId,
  input_tokens:input.usage.inputTokens,cached_input_tokens:cached,output_tokens:input.usage.outputTokens,
  total_tokens:input.usage.totalTokens,input_cost_usd:inputCost,cached_input_cost_usd:cachedCost,
  output_cost_usd:outputCost,total_cost_usd:rate?Number(((inputCost??0)+(cachedCost??0)+(outputCost??0)).toFixed(8)):null,
  pricing_status:rate?"priced":"unpriced",pricing_snapshot:rate?{
   pricingId:rate.id,inputUsdPerMillionTokens:Number(rate.input_usd_per_million_tokens),
   cachedInputUsdPerMillionTokens:Number(rate.cached_input_usd_per_million_tokens),
   outputUsdPerMillionTokens:Number(rate.output_usd_per_million_tokens),sourceUrl:rate.source_url
  }:null,billing_period_start:monthStart(occurredAt),occurred_at:occurredAt
 };
 const {error}=await db.from("ai_provider_usage").insert(values);
 if(error&&error.code!=="23505")console.error("AI provider usage could not be recorded",{businessId:input.businessId,provider:input.usage.provider,model:input.usage.model,code:error.code});
}
