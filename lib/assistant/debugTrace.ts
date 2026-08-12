export type AssistantTraceDetails=Record<string,boolean|string|number|null|undefined>;
export type AssistantTraceSink=(event:string,details:AssistantTraceDetails)=>void;

export const assistantDebugEnabled=()=>process.env.NEXT_PUBLIC_ASSISTANT_VOICE_DEBUG==="true"||process.env.ASSISTANT_SELECTION_DEBUG==="true";

export function assistantTrace(event:string,details:AssistantTraceDetails={},sink?:AssistantTraceSink){
 if(sink){sink(event,details);return;}
 if(assistantDebugEnabled())console.debug("Assistant request trace",{event,...details});
}

export function safeAssistantErrorCategory(error:unknown){
 if(!(error instanceof Error))return"unknown";
 if(/permission|role|allow/i.test(error.message))return"permission_denied";
 if(/selected invoice|not found|no longer available|record/i.test(error.message))return"invoice_rejected";
 if(/confirm|prepare|action/i.test(error.message))return"pending_action_failed";
 return"assistant_request_failed";
}
