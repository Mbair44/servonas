import {
  addJobNoteResponseSchema,
  jobDetailResponseSchema,
  meResponseSchema,
  ownerManagerDashboardResponseSchema,
  technicianHomeResponseSchema,
  type JobDetailData,
  type MeResponse,
  type OwnerManagerDashboardData,
  type TechnicianHomeData,
  type AddJobNoteRequest,
  type MobileJobsListData,
  type MobileJobsRange,
  mobileJobsListResponseSchema,
  mobileConversationListResponseSchema,mobileConversationMessagesResponseSchema,
  sendConversationMessageResponseSchema,prepareConversationAttachmentResponseSchema,markConversationReadResponseSchema,type SendConversationMessageRequest,type PrepareConversationAttachmentRequest,
  type MobileConversationListData,type MobileConversationMessagesData,
} from "@servonas/shared";
import { supabase } from "./supabase";
export class MobileApiError extends Error{constructor(public status:number,message:string){super(message)}}
const baseUrl=process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/,"");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Gives support a non-sensitive contract reference without ever displaying a
 * bearer token, response body, note content, or customer data on the device.
 */
function invalidResponseMessage(body:unknown,error:unknown,kind:"mobile"|"note"){
  const reference=body&&typeof body==="object"&&uuid.test(String((body as {requestId?:unknown}).requestId??""))
    ? String((body as {requestId:string}).requestId) : null;
  const issue=error&&typeof error==="object"&&Array.isArray((error as {issues?:unknown}).issues)
    ? (error as {issues:{path?:unknown}[]}).issues[0] : null;
  const path=Array.isArray(issue?.path)&&issue.path.every(segment=>typeof segment==="string"||typeof segment==="number")
    ? issue.path.join(".") : null;
  return `Servonas returned an invalid ${kind} response${path?` (${path})`:""}.${reference?` Reference: ${reference}.`:" Please try again."}`;
}

async function mobileGet<T>(path:string,schema:{parse:(value:unknown)=>{data:T}},signal?:AbortSignal):Promise<T>{
  if(!baseUrl)throw new MobileApiError(0,"Mobile API URL is not configured.");
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new MobileApiError(401,"Your session has expired.");
  let response:Response;
  try{response=await fetch(`${baseUrl}${path}`,{headers:{Authorization:`Bearer ${session.access_token}`},signal});}
  catch{throw new MobileApiError(0,"Network unavailable. Check your connection and try again.");}
  const body:unknown=await response.json().catch(()=>null);
  if(!response.ok)throw new MobileApiError(response.status,(body as any)?.error?.message||"Unable to load mobile data.");
  try{return schema.parse(body).data;}catch(error){throw new MobileApiError(0,invalidResponseMessage(body,error,"mobile"));}
}

export async function mobileMe(signal?:AbortSignal):Promise<MeResponse["data"]>{return mobileGet("/api/v1/mobile/me",meResponseSchema,signal);}
export async function ownerManagerHome(businessId:string,signal?:AbortSignal):Promise<OwnerManagerDashboardData>{return mobileGet(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/owner-home`,ownerManagerDashboardResponseSchema,signal);}
export async function technicianHome(businessId:string,signal?:AbortSignal):Promise<TechnicianHomeData>{return mobileGet(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/employee-home`,technicianHomeResponseSchema,signal);}
export async function mobileJobs(businessId:string,range:MobileJobsRange,signal?:AbortSignal):Promise<MobileJobsListData>{return mobileGet(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/jobs?range=${range}&limit=100`,mobileJobsListResponseSchema,signal);}
export async function jobDetail(businessId:string,jobId:string,signal?:AbortSignal):Promise<JobDetailData>{return mobileGet(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/jobs/${encodeURIComponent(jobId)}`,jobDetailResponseSchema,signal);}
export async function conversations(businessId:string,cursor?:string,signal?:AbortSignal):Promise<MobileConversationListData>{return mobileGet(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/conversations?limit=25${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`,mobileConversationListResponseSchema,signal);}
export async function conversationMessages(businessId:string,key:string,cursor?:string,signal?:AbortSignal):Promise<MobileConversationMessagesData>{return mobileGet(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/conversations/${encodeURIComponent(key)}/messages?limit=50${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`,mobileConversationMessagesResponseSchema,signal);}
export async function sendConversationMessage(businessId:string,key:string,input:SendConversationMessageRequest){if(!baseUrl)throw new MobileApiError(0,"Mobile API URL is not configured.");const {data:{session}}=await supabase.auth.getSession();if(!session)throw new MobileApiError(401,"Your session has expired.");let response:Response;try{response=await fetch(`${baseUrl}/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/conversations/${encodeURIComponent(key)}/messages`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"content-type":"application/json"},body:JSON.stringify(input)});}catch{throw new MobileApiError(0,"Network unavailable. Your message was not submitted; retry uses the same request ID.");}const body:unknown=await response.json().catch(()=>null);if(!response.ok)throw new MobileApiError(response.status,(body as any)?.error?.message||"Message could not be submitted.");return sendConversationMessageResponseSchema.parse(body).data;}
async function mobilePost<T>(path:string,input:unknown,schema:{parse:(value:unknown)=>{data:T}}):Promise<T>{if(!baseUrl)throw new MobileApiError(0,"Mobile API URL is not configured.");const {data:{session}}=await supabase.auth.getSession();if(!session)throw new MobileApiError(401,"Your session has expired.");let response:Response;try{response=await fetch(`${baseUrl}${path}`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"content-type":"application/json"},body:JSON.stringify(input)});}catch{throw new MobileApiError(0,"Network unavailable. Please try again.");}const body:unknown=await response.json().catch(()=>null);if(!response.ok)throw new MobileApiError(response.status,(body as any)?.error?.message||"The request could not be completed.");try{return schema.parse(body).data;}catch{throw new MobileApiError(0,"Servonas returned an invalid mobile response. Please try again.");}}
export async function prepareConversationAttachment(businessId:string,input:PrepareConversationAttachmentRequest):Promise<{attachmentId:string;bucket:"customer-message-media";path:string;uploadToken:string}>{return mobilePost(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/conversation-attachments`,input,prepareConversationAttachmentResponseSchema);}
export async function markMobileConversationRead(businessId:string,key:string){return mobilePost(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/conversations/${encodeURIComponent(key)}/read`,{},markConversationReadResponseSchema);}
export async function addJobNote(businessId:string,jobId:string,input:AddJobNoteRequest){
  if(!baseUrl)throw new MobileApiError(0,"Mobile API URL is not configured.");
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new MobileApiError(401,"Your session has expired.");
  let response:Response;
  try {
    response=await fetch(`${baseUrl}/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/jobs/${encodeURIComponent(jobId)}/notes`,{
      method:"POST",
      headers:{Authorization:`Bearer ${session.access_token}`,"content-type":"application/json"},
      body:JSON.stringify(input),
    });
  } catch {
    throw new MobileApiError(0,"Network unavailable. Check your connection and try again.");
  }
  const body:unknown=await response.json().catch(()=>null);
  if(!response.ok)throw new MobileApiError(response.status,(body as any)?.error?.message||"Unable to add note.");
  try{return addJobNoteResponseSchema.parse(body).data;}
  catch(error){throw new MobileApiError(0,invalidResponseMessage(body,error,"note"));}
}
