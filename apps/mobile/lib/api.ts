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
} from "@servonas/shared";
import { supabase } from "./supabase";
export class MobileApiError extends Error{constructor(public status:number,message:string){super(message)}}
const baseUrl=process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/,"");

async function mobileGet<T>(path:string,schema:{parse:(value:unknown)=>{data:T}},signal?:AbortSignal):Promise<T>{
  if(!baseUrl)throw new MobileApiError(0,"Mobile API URL is not configured.");
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new MobileApiError(401,"Your session has expired.");
  let response:Response;
  try{response=await fetch(`${baseUrl}${path}`,{headers:{Authorization:`Bearer ${session.access_token}`},signal});}
  catch{throw new MobileApiError(0,"Network unavailable. Check your connection and try again.");}
  const body:unknown=await response.json().catch(()=>null);
  if(!response.ok)throw new MobileApiError(response.status,(body as any)?.error?.message||"Unable to load mobile data.");
  try{return schema.parse(body).data;}catch{throw new MobileApiError(0,"Servonas returned an invalid mobile response. Please try again.");}
}

export async function mobileMe(signal?:AbortSignal):Promise<MeResponse["data"]>{return mobileGet("/api/v1/mobile/me",meResponseSchema,signal);}
export async function ownerManagerHome(businessId:string,signal?:AbortSignal):Promise<OwnerManagerDashboardData>{return mobileGet(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/owner-home`,ownerManagerDashboardResponseSchema,signal);}
export async function technicianHome(businessId:string,signal?:AbortSignal):Promise<TechnicianHomeData>{return mobileGet(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/employee-home`,technicianHomeResponseSchema,signal);}
export async function jobDetail(businessId:string,jobId:string,signal?:AbortSignal):Promise<JobDetailData>{return mobileGet(`/api/v1/mobile/businesses/${encodeURIComponent(businessId)}/jobs/${encodeURIComponent(jobId)}`,jobDetailResponseSchema,signal);}
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
  catch{throw new MobileApiError(0,"Servonas returned an invalid note response. Please try again.");}
}
