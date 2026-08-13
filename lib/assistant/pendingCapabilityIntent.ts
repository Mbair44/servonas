import type {AssistantCapabilityIntent} from "./capabilityIntents.ts";

export const PENDING_CAPABILITY_TTL_MS=30*60*1000;
export type PendingCreateIntent={
 type:"appointment_create"|"job_create";
 customerId?:string;
 customerName?:string;
 collected:{localDate?:string;localTime?:string;title?:string;durationMinutes?:number};
 missing:string[];
 originatingRequestId:string;
 createdAt:string;
};

export function pendingCapabilityFromContext(context:Record<string,unknown>,now=Date.now()):PendingCreateIntent|null{
 const value=context.pendingCapabilityIntent;if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const pending=value as PendingCreateIntent;
 if(!["appointment_create","job_create"].includes(pending.type)||!pending.createdAt||now-Date.parse(pending.createdAt)>PENDING_CAPABILITY_TTL_MS)return null;
 return pending;
}
export function setPendingCapability<T extends Record<string,unknown>>(context:T,pending:PendingCreateIntent){return{...context,pendingCapabilityIntent:pending};}
export function clearPendingCapability<T extends Record<string,unknown>>(context:T){const next={...context};delete (next as Record<string,unknown>).pendingCapabilityIntent;return next;}
export function cancelsPendingCapability(input:string){return /^\s*(?:cancel|never mind|nevermind|forget it|stop)\b/i.test(input);}
export function isCreateCapability(intent:AssistantCapabilityIntent):intent is PendingCreateIntent["type"]{return intent==="appointment_create"||intent==="job_create";}
