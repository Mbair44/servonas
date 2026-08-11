import type {ToolDefinition} from "./tools.ts";

export type ProviderMessage={role:"user"|"assistant";content:string};
export type ProviderUsage={provider:"openai";model:string;requestId:string|null;inputTokens:number;cachedInputTokens:number;outputTokens:number;totalTokens:number;occurredAt:string};
export type ProviderDecision=({toolName:string;arguments:Record<string,unknown>}|{response:string})&{usage?:ProviderUsage};
export interface AIProvider{generateResponse(input:{messages:ProviderMessage[];system:string;tools:readonly ToolDefinition[]}):Promise<ProviderDecision>;}

export class OpenAIProvider implements AIProvider{
 constructor(private apiKey=process.env.OPENAI_API_KEY?.trim(),private model=process.env.OPENAI_ASSISTANT_MODEL?.trim()||"gpt-4.1-mini"){}
 async generateResponse(input:{messages:ProviderMessage[];system:string;tools:readonly ToolDefinition[]}):Promise<ProviderDecision>{
  if(!this.apiKey)throw new Error("provider_unavailable");
  const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:this.model,temperature:0,messages:[{role:"system",content:input.system},...input.messages],tools:input.tools.map(t=>({type:"function",function:{name:t.name,description:t.description,parameters:t.parameters}})),tool_choice:"auto"})});
  if(!response.ok)throw new Error("provider_unavailable");const body=await response.json() as any,choice=body.choices?.[0]?.message,call=choice?.tool_calls?.[0],inputTokens=Math.max(0,Number(body.usage?.prompt_tokens??0)),outputTokens=Math.max(0,Number(body.usage?.completion_tokens??0));
  const usage:ProviderUsage={provider:"openai",model:String(body.model||this.model),requestId:typeof body.id==="string"?body.id:null,inputTokens,cachedInputTokens:Math.max(0,Number(body.usage?.prompt_tokens_details?.cached_tokens??0)),outputTokens,totalTokens:Math.max(0,Number(body.usage?.total_tokens??inputTokens+outputTokens)),occurredAt:new Date().toISOString()};
  if(call?.function?.name){let args:unknown;try{args=JSON.parse(call.function.arguments||"{}");}catch{throw new Error("provider_invalid_output");}if(!args||typeof args!=="object"||Array.isArray(args))throw new Error("provider_invalid_output");return{toolName:call.function.name,arguments:args as Record<string,unknown>,usage};}
  return{response:String(choice?.content||"I couldn't understand that request.").slice(0,4000),usage};
 }
}

export const getAssistantProvider=():AIProvider=>new OpenAIProvider();
