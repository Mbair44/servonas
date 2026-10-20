"use server";
import {revalidatePath} from "next/cache";
import {canManageCustomers} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";

export async function decideGoogleReviewMatch(slug:string,reviewId:string,customerId:string,status:"confirmed"|"rejected"){
 const {supabase,business,user,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role))throw new Error("You do not have permission to manage review matches.");
 const {data:review}=await supabase.from("google_reviews").select("id").eq("id",reviewId).eq("business_id",business.id).maybeSingle();
 const {data:customer}=await supabase.from("customers").select("id").eq("id",customerId).eq("business_id",business.id).maybeSingle();
 if(!review||!customer)throw new Error("Review or customer was not found in this business.");
 const {error}=await supabase.from("google_review_customer_matches").upsert({business_id:business.id,review_id:reviewId,customer_id:customerId,status,decided_by:user.id,decided_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"review_id,customer_id"});
 if(error)throw new Error("Could not save review match.");
 revalidatePath(`/app/${slug}/reviews`);revalidatePath(`/app/${slug}/customers/${customerId}`);
}

export async function setCustomerReviewedOverride(slug:string,customerId:string,active:boolean){
 const {supabase,business,user,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role))throw new Error("You do not have permission to change review status.");
 if(active){const {data:location,error:locationError}=await supabase.from("business_google_locations").select("id").eq("business_id",business.id).eq("is_active",true).order("created_at").limit(1).maybeSingle();if(locationError||!location)throw new Error("Connect and select a Google Business Profile location before marking a customer reviewed.");const {error}=await supabase.from("customer_review_overrides").insert({business_id:business.id,customer_id:customerId,google_location_id:location.id,status:"reviewed",active:true,reason:"Manually marked reviewed",created_by:user.id});if(error)throw new Error("Could not save review status.");}
 else {const {error}=await supabase.from("customer_review_overrides").update({active:false,reversed_at:new Date().toISOString(),reversed_by:user.id}).eq("business_id",business.id).eq("customer_id",customerId).eq("status","reviewed").eq("active",true);if(error)throw new Error("Could not reverse review status.");}
 revalidatePath(`/app/${slug}/reviews`);revalidatePath(`/app/${slug}/customers/${customerId}`);
}
