"use server";

import {revalidatePath} from "next/cache";
import {canManageBusiness,canManageCustomers} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";

function required(formData:FormData,name:string){
 const value=formData.get(name);
 return typeof value==="string"&&value?value:null;
}

async function audit(supabase:any,input:{businessId:string;reviewId:string;customerId:string;actorUserId:string;action:"manually_proposed"|"confirmed"|"rejected"|"removed";previousStatus?:string|null;nextStatus?:string|null}){
 const {error}=await supabase.from("google_review_match_audits").insert({business_id:input.businessId,review_id:input.reviewId,customer_id:input.customerId,actor_user_id:input.actorUserId,action:input.action,previous_status:input.previousStatus??null,next_status:input.nextStatus??null});
 if(error)throw new Error("Could not record the review-match change.");
}

async function requireOwnedReviewAndCustomer(supabase:any,businessId:string,reviewId:string,customerId:string){
 const [{data:review},{data:customer}]=await Promise.all([
  supabase.from("google_reviews").select("id").eq("id",reviewId).eq("business_id",businessId).maybeSingle(),
  supabase.from("customers").select("id").eq("id",customerId).eq("business_id",businessId).eq("is_deleted",false).maybeSingle(),
 ]);
 if(!review||!customer)throw new Error("Review or customer was not found in this business.");
}

async function requireMatchManager(slug:string){
 const workspace=await requireWorkspace(slug);
 if(!canManageBusiness(workspace.role))throw new Error("Only business owners and administrators can manage review matches.");
 return workspace;
}

export async function decideGoogleReviewMatch(slug:string,formData:FormData){
 const reviewId=required(formData,"reviewId"),customerId=required(formData,"customerId"),status: "confirmed"|"rejected"=formData.get("status")==="confirmed"?"confirmed":"rejected";
 if(!reviewId||!customerId)throw new Error("A review and customer are required.");
 const {supabase,business,user}=await requireMatchManager(slug);
 await requireOwnedReviewAndCustomer(supabase,business.id,reviewId,customerId);
 const {data:existing}=await supabase.from("google_review_customer_matches").select("status").eq("business_id",business.id).eq("review_id",reviewId).eq("customer_id",customerId).maybeSingle();
 if(status==="confirmed"){
  const {data:confirmed}=await supabase.from("google_review_customer_matches").select("customer_id").eq("business_id",business.id).eq("review_id",reviewId).eq("status","confirmed").maybeSingle();
  if(confirmed&&confirmed.customer_id!==customerId)throw new Error("Remove the existing confirmed match before confirming another customer.");
 }
 const {error}=await supabase.from("google_review_customer_matches").upsert({business_id:business.id,review_id:reviewId,customer_id:customerId,status,decided_by:user.id,decided_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"review_id,customer_id"});
 if(error)throw new Error("Could not save review match.");
 await audit(supabase,{businessId:business.id,reviewId,customerId,actorUserId:user.id,action:status,previousStatus:existing?.status,nextStatus:status});
 revalidatePath(`/app/${slug}/reviews`);
 revalidatePath(`/app/${slug}/customers/${customerId}`);
}

export async function proposeGoogleReviewMatch(slug:string,formData:FormData){
 const reviewId=required(formData,"reviewId"),customerId=required(formData,"customerId");
 if(!reviewId||!customerId)throw new Error("A review and customer are required.");
 const {supabase,business,user}=await requireMatchManager(slug);
 await requireOwnedReviewAndCustomer(supabase,business.id,reviewId,customerId);
 const {data:confirmed}=await supabase.from("google_review_customer_matches").select("customer_id").eq("business_id",business.id).eq("review_id",reviewId).eq("status","confirmed").maybeSingle();
 if(confirmed)throw new Error("Remove the confirmed match before selecting another customer.");
 const {data:existing}=await supabase.from("google_review_customer_matches").select("status").eq("business_id",business.id).eq("review_id",reviewId).eq("customer_id",customerId).maybeSingle();
 const {error}=await supabase.from("google_review_customer_matches").upsert({business_id:business.id,review_id:reviewId,customer_id:customerId,status:"suggested",confidence:null,match_reason:{strategy:"manual_selection"},updated_at:new Date().toISOString()},{onConflict:"review_id,customer_id"});
 if(error)throw new Error("Could not propose review match.");
 await audit(supabase,{businessId:business.id,reviewId,customerId,actorUserId:user.id,action:"manually_proposed",previousStatus:existing?.status,nextStatus:"suggested"});
 revalidatePath(`/app/${slug}/reviews`);
}

export async function removeGoogleReviewMatch(slug:string,formData:FormData){
 const reviewId=required(formData,"reviewId"),customerId=required(formData,"customerId");
 if(!reviewId||!customerId)throw new Error("A review and customer are required.");
 const {supabase,business,user}=await requireMatchManager(slug);
 const {data:existing}=await supabase.from("google_review_customer_matches").select("status").eq("business_id",business.id).eq("review_id",reviewId).eq("customer_id",customerId).maybeSingle();
 if(!existing)throw new Error("Review match was not found in this business.");
 const {error}=await supabase.from("google_review_customer_matches").delete().eq("business_id",business.id).eq("review_id",reviewId).eq("customer_id",customerId);
 if(error)throw new Error("Could not remove review match.");
 await audit(supabase,{businessId:business.id,reviewId,customerId,actorUserId:user.id,action:"removed",previousStatus:existing.status,nextStatus:null});
 revalidatePath(`/app/${slug}/reviews`);
 revalidatePath(`/app/${slug}/customers/${customerId}`);
}

export async function setCustomerReviewedOverride(slug:string,customerId:string,active:boolean){
 const {supabase,business,user,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role))throw new Error("You do not have permission to change review status.");
 if(active){const {data:location,error:locationError}=await supabase.from("business_google_locations").select("id").eq("business_id",business.id).eq("is_active",true).order("created_at").limit(1).maybeSingle();if(locationError||!location)throw new Error("Connect and select a Google Business Profile location before marking a customer reviewed.");const {error}=await supabase.from("customer_review_overrides").insert({business_id:business.id,customer_id:customerId,google_location_id:location.id,status:"reviewed",active:true,reason:"Manually marked reviewed",created_by:user.id});if(error)throw new Error("Could not save review status.");}
 else {const {error}=await supabase.from("customer_review_overrides").update({active:false,reversed_at:new Date().toISOString(),reversed_by:user.id}).eq("business_id",business.id).eq("customer_id",customerId).eq("status","reviewed").eq("active",true);if(error)throw new Error("Could not reverse review status.");}
 revalidatePath(`/app/${slug}/reviews`);revalidatePath(`/app/${slug}/customers/${customerId}`);
}
