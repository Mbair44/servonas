import type {SupabaseClient} from "@supabase/supabase-js";
export async function captureReservedPlatformFee(db:SupabaseClient,input:{reservationId:string;paymentIntentId:string;chargeId:string;applicationFeeId:string;applicationFeeCents:number;eventId:string}){
 const {error}=await db.rpc("finalize_platform_fee_reservation",{p_reservation_id:input.reservationId,p_provider_payment_id:input.paymentIntentId,p_provider_charge_id:input.chargeId,p_provider_application_fee_id:input.applicationFeeId,p_provider_application_fee_cents:input.applicationFeeCents,p_event_key:`stripe-capture:${input.eventId}`});
 if(error)throw new Error(`Platform fee capture failed (${error.code}).`);
}
export async function releaseReservedPlatformFee(db:SupabaseClient,input:{reservationId:string;eventId:string;reason:string}){
 const {error}=await db.rpc("release_platform_fee_reservation",{p_reservation_id:input.reservationId,p_event_key:`stripe-release:${input.eventId}`,p_reason:input.reason});
 if(error)throw new Error(`Platform fee release failed (${error.code}).`);
}
export async function queuePlatformFeeReconciliation(db:SupabaseClient,input:{businessId:string;reservationId:string|null;connectedAccountId:string|null;paymentIntentId?:string|null;checkoutSessionId?:string|null;type:"missing_application_fee"|"checkout_expiration_uncertain"|"refund_uncertain"|"dispute_opened"|"dispute_final"|"fee_mismatch";error:string}){
 const {error}=await db.from("platform_fee_reconciliation_cases").upsert({business_id:input.businessId,reservation_id:input.reservationId,connected_account_id:input.connectedAccountId,provider_payment_intent_id:input.paymentIntentId??null,provider_checkout_session_id:input.checkoutSessionId??null,exception_type:input.type,last_error:input.error.slice(0,1000),status:"open"},{onConflict:"reservation_id,exception_type,status"});
 if(error)throw new Error(`Platform fee reconciliation could not be queued (${error.code}).`);
}
