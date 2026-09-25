import type {SupabaseClient} from "@supabase/supabase-js";

export type AssistedAttribution={kind:"tracked";sessionId:string;recoveredFromBookingId?:string|null}|{kind:"manual";source:"meta_ads"|"google_ads"|"google_business_profile"|"organic"|"organic_social"|"referral"|"direct"|"unknown"};

const manualFields:Record<Extract<AssistedAttribution,{kind:"manual"}>["source"],Record<string,string>>={
 meta_ads:{utm_source:"facebook",utm_medium:"paid_social"},google_ads:{utm_source:"google",utm_medium:"cpc"},google_business_profile:{utm_source:"google",utm_medium:"organic",utm_campaign:"google_business_profile"},organic:{utm_medium:"organic"},organic_social:{utm_medium:"social"},referral:{utm_medium:"referral"},direct:{utm_source:"direct"},unknown:{},
};

/** Saves either copied first-touch evidence or an explicitly manual channel claim. Never invents resource IDs. */
export async function applyAssistedBookingAttribution(db:SupabaseClient,input:{businessId:string;bookingId:string;attribution:AssistedAttribution}){
 const now=new Date().toISOString();
 if(input.attribution.kind==="tracked"){
  const {data:session,error}=await db.from("booking_attribution_sessions").select("id,first_landing_url,first_landing_path,first_referrer,gclid,gbraid,wbraid,fbclid,utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id").eq("business_id",input.businessId).eq("id",input.attribution.sessionId).maybeSingle();
  if(error||!session)throw new Error("The selected customer session is unavailable.");
  if(input.attribution.recoveredFromBookingId){const {data:source}=await db.from("bookings").select("id").eq("id",input.attribution.recoveredFromBookingId).eq("business_id",input.businessId).maybeSingle();if(!source)throw new Error("The recovered booking does not belong to this business.");}
  const {id:sessionId,...snapshot}=session;
  const {error:snapshotError}=await db.from("booking_attribution_snapshots").upsert({...snapshot,booking_id:input.bookingId,business_id:input.businessId,attribution_session_id:sessionId,attribution_evidence:"tracked_session",updated_at:now},{onConflict:"booking_id"});if(snapshotError)throw snapshotError;
  const {error:bookingError}=await db.from("bookings").update({conversion_method:"admin_assisted",recovered_from_booking_id:input.attribution.recoveredFromBookingId??null,recovered_from_attribution_session_id:session.id}).eq("id",input.bookingId).eq("business_id",input.businessId);if(bookingError)throw bookingError;
  return {evidence:"tracked_session" as const,sessionId:session.id};
 }
 const fields=manualFields[input.attribution.source];
 const {error:snapshotError}=await db.from("booking_attribution_snapshots").upsert({booking_id:input.bookingId,business_id:input.businessId,attribution_session_id:null,first_landing_url:null,first_landing_path:null,first_referrer:null,gclid:null,gbraid:null,wbraid:null,fbclid:null,utm_campaign:null,utm_content:null,utm_term:null,utm_id:null,...fields,attribution_evidence:"customer_reported",updated_at:now},{onConflict:"booking_id"});if(snapshotError)throw snapshotError;
 const {error:bookingError}=await db.from("bookings").update({conversion_method:"admin_assisted",recovered_from_booking_id:null,recovered_from_attribution_session_id:null}).eq("id",input.bookingId).eq("business_id",input.businessId);if(bookingError)throw bookingError;
 return {evidence:"customer_reported" as const,sessionId:null};
}
