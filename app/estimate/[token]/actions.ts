"use server";

import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { publicDocumentTokenHash, validPublicDocumentToken } from "@/lib/publicDocumentToken";
import { dateInTimeZone } from "@/lib/bookingTime";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function findEstimate(token:string){
  if(!validPublicDocumentToken(token)) return null;
  const supabase=getSupabaseAdmin(); if(!supabase) return null;
  const hash=await publicDocumentTokenHash(token);
  const {data,error}=await supabase.from("estimates").select("id,business_id,status,version_number,accepted_version,expiration_date,public_token_expires_at,public_token_revoked_at,businesses(timezone)").eq("public_token_hash",hash).maybeSingle();
  if(error){console.error("Public estimate action lookup failed",{code:error.code});return null;}
  return {supabase,estimate:data};
}
function result(token:string,kind:"success"|"error",message:string){return `/estimate/${token}?${kind}=${encodeURIComponent(message)}`;}
function unavailable(estimate:NonNullable<Awaited<ReturnType<typeof findEstimate>>>["estimate"]){
  if(!estimate||estimate.public_token_revoked_at)return true;
  if(estimate.public_token_expires_at&&new Date(estimate.public_token_expires_at)<=new Date())return true;
  const business=Array.isArray(estimate.businesses)?estimate.businesses[0]:estimate.businesses;
  return Boolean(estimate.expiration_date&&estimate.expiration_date<dateInTimeZone(new Date(),business?.timezone||"UTC"));
}

export async function acceptEstimate(token:string,formData:FormData){
  const found=await findEstimate(token); if(!found?.estimate)redirect(result(token,"error","This estimate link is unavailable."));
  const {supabase,estimate}=found;
  if(unavailable(estimate))redirect(result(token,"error","This estimate has expired or is no longer available."));
  if(estimate.status==="accepted"&&estimate.accepted_version===estimate.version_number)redirect(result(token,"success","This estimate was already accepted."));
  if(!["sent","viewed"].includes(estimate.status))redirect(result(token,"error","This estimate can no longer be accepted."));
  const name=text(formData,"name"),email=text(formData,"email"),message=text(formData,"message");
  if(!name||name.length>160||!emailPattern.test(email))redirect(result(token,"error","Enter your name and a valid email address."));
  if(formData.get("acknowledgment")!=="on")redirect(result(token,"error","Confirm that you approve this estimate."));
  const now=new Date().toISOString();
  const {data,error}=await supabase.from("estimates").update({
    status:"accepted",accepted_at:now,accepted_by_name:name,accepted_by_email:email,
    accepted_version:estimate.version_number,
  }).eq("id",estimate.id).eq("business_id",estimate.business_id).in("status",["sent","viewed"]).select("id").maybeSingle();
  if(error){console.error("Public estimate acceptance failed",{code:error.code,estimateId:estimate.id});redirect(result(token,"error","The estimate could not be accepted. Please try again."));}
  if(!data){
    const {data:current}=await supabase.from("estimates").select("status,accepted_version").eq("id",estimate.id).eq("business_id",estimate.business_id).maybeSingle();
    if(current?.status==="accepted"&&current.accepted_version===estimate.version_number)redirect(result(token,"success","Estimate accepted."));
    redirect(result(token,"error","The estimate changed before it could be accepted. Please refresh."));
  }
  await supabase.from("estimate_events").insert({
    business_id:estimate.business_id,estimate_id:estimate.id,event_type:"accepted",
    customer_actor_name:name,customer_actor_email:email,metadata:message?{message}: {},
  });
  redirect(result(token,"success","Estimate accepted. Thank you."));
}

export async function declineEstimate(token:string,formData:FormData){
  const found=await findEstimate(token);if(!found?.estimate)redirect(result(token,"error","This estimate link is unavailable."));
  const {supabase,estimate}=found;
  if(unavailable(estimate))redirect(result(token,"error","This estimate has expired or is no longer available."));
  if(estimate.status==="declined")redirect(result(token,"success","This estimate was already declined."));
  if(!["sent","viewed"].includes(estimate.status))redirect(result(token,"error","This estimate can no longer be declined."));
  const name=text(formData,"name"),email=text(formData,"email"),reason=text(formData,"reason");
  if(!name||name.length>160||!emailPattern.test(email))redirect(result(token,"error","Enter your name and a valid email address."));
  if(reason.length>2000)redirect(result(token,"error","Keep your message under 2,000 characters."));
  const {data,error}=await supabase.from("estimates").update({
    status:"declined",declined_at:new Date().toISOString(),decline_reason:reason||null,
  }).eq("id",estimate.id).eq("business_id",estimate.business_id).in("status",["sent","viewed"]).select("id").maybeSingle();
  if(error){console.error("Public estimate decline failed",{code:error.code,estimateId:estimate.id});redirect(result(token,"error","The response could not be saved."));}
  if(!data)redirect(result(token,"error","The estimate changed before your response was saved."));
  await supabase.from("estimate_events").insert({
    business_id:estimate.business_id,estimate_id:estimate.id,event_type:"declined",
    customer_actor_name:name,customer_actor_email:email,metadata:{has_message:Boolean(reason)},
  });
  redirect(result(token,"success","Your response was saved."));
}
