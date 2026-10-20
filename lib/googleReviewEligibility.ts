import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export type ReviewEligibility={eligible:boolean;reason?:string;locationId?:string|null};

/** Server-only final check. A missing Google connection is not an error: only
 * last-known confirmed state suppresses messaging when sync is unavailable. */
export async function claimGoogleReviewRequestEligibility(input:{eventId:string;businessId:string;customerId:string}):Promise<ReviewEligibility>{
 const db=getSupabaseAdmin(); if(!db)return {eligible:false,reason:"review_eligibility_unavailable"};
 const {data:location,error:locationError}=await db.from("business_google_locations").select("id").eq("business_id",input.businessId).eq("is_active",true).order("created_at").limit(1).maybeSingle();
 if(locationError)return {eligible:false,reason:"review_eligibility_unavailable"};
 // No selected GBP location means there is no location-specific review URL flow.
 // The existing URL validation will report that separately.
 if(!location)return {eligible:true,locationId:null};
 const {data,error}=await db.rpc("claim_google_review_request_eligibility",{p_event_id:input.eventId,p_business_id:input.businessId,p_customer_id:input.customerId,p_google_location_id:location.id});
 if(error)return {eligible:false,reason:"review_eligibility_unavailable",locationId:location.id};
 const row=Array.isArray(data)?data[0]:data;
 return {eligible:Boolean(row?.eligible),reason:row?.reason??undefined,locationId:location.id};
}
