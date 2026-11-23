import type {SupabaseClient} from "@supabase/supabase-js";
import {captureReservedPlatformFee,releaseReservedPlatformFee} from "./feeLifecycle";
import {refundCapturedPlatformFee} from "./applicationFeeRefunds.ts";
import {determineDisputeAdjustment} from "./disputeAccounting.ts";
type StripeProbe={paymentIntents:{retrieve(id:string,o:unknown,c:unknown):Promise<any>};checkout:{sessions:{retrieve(id:string,o:unknown,c:unknown):Promise<any>}};applicationFees:{retrieve(id:string):Promise<any>;createRefund(id:string,params:{amount:number},options:{idempotencyKey:string}):Promise<any>}};
const terminalPaymentStates=new Set(["canceled","requires_payment_method"]);
const backoff=(attempt:number)=>new Date(Date.now()+Math.min(86_400_000,2**attempt*60_000)).toISOString();
export async function reconcilePlatformFeeCases(db:SupabaseClient,stripe:StripeProbe,limit=50){
 const {data:cases,error}=await db.from("platform_fee_reconciliation_cases").select("*").in("status",["open","retrying"]).lte("next_retry_at",new Date().toISOString()).limit(limit);if(error)throw error;let resolved=0,failed=0;
 for(const entry of cases??[]){try{
  if(!entry.reservation_id)throw new Error("Reconciliation case has no reservation.");
  if(entry.exception_type==="refund_uncertain"){
   const {data:refund,error:refundError}=await db.from("platform_fee_refunds").select("provider_refund_id,customer_refund_cents").eq("reservation_id",entry.reservation_id).in("status",["pending","reconciliation_required"]).order("created_at").limit(1).maybeSingle();
   if(refundError||!refund)throw new Error("Uncertain fee refund record unavailable.");
   const {data:reservation,error:reservationError}=await db.from("platform_fee_reservations").select("business_id").eq("id",entry.reservation_id).maybeSingle();
   if(reservationError||!reservation)throw new Error("Fee reservation unavailable.");
   await refundCapturedPlatformFee(db,stripe,{reservationId:entry.reservation_id,businessId:reservation.business_id,providerRefundId:refund.provider_refund_id,customerRefundCents:Number(refund.customer_refund_cents),eventId:`reconcile:${entry.id}`,connectedAccountId:entry.connected_account_id});
   await db.from("platform_fee_reconciliation_cases").update({status:"resolved",resolved_at:new Date().toISOString(),last_error:null}).eq("id",entry.id);resolved++;continue;
  }
  if(entry.exception_type==="dispute_final"){
   const {data:reservation,error:reservationError}=await db.from("platform_fee_reservations").select("reserved_fee_cents,provider_charge_id,provider_application_fee_id").eq("id",entry.reservation_id).maybeSingle();
   if(reservationError||!reservation?.provider_application_fee_id||!reservation.provider_charge_id)throw new Error("Verified Application Fee ID unavailable for dispute.");
   const {data:dispute,error:disputeError}=await db.from("platform_fee_disputes").select("provider_dispute_id,final_outcome").eq("reservation_id",entry.reservation_id).not("final_outcome","is",null).order("updated_at",{ascending:false}).limit(1).maybeSingle();
   if(disputeError||!dispute)throw new Error("Final dispute evidence unavailable.");
   const fee=await stripe.applicationFees.retrieve(reservation.provider_application_fee_id);
   const {data:ledger,error:ledgerError}=await db.from("platform_fee_ledger").select("amount_cents,event_type").eq("reservation_id",entry.reservation_id).in("event_type",["refund_reversal","dispute_fee_reversal","dispute_fee_recovery"]);
   if(ledgerError)throw new Error("Fee ledger unavailable for dispute reconciliation.");
   const customerRefunded=(ledger??[]).filter(row=>row.event_type==="refund_reversal").reduce((sum,row)=>sum+Math.abs(Number(row.amount_cents)),0);
   const disputeNet=(ledger??[]).filter(row=>row.event_type!=="refund_reversal").reduce((sum,row)=>sum+(row.event_type==="dispute_fee_reversal"?Math.abs(Number(row.amount_cents)):-Number(row.amount_cents)),0);
   const adjustment=determineDisputeAdjustment({capturedFeeCents:Number(reservation.reserved_fee_cents),customerRefundedFeeCents:customerRefunded,recordedDisputeNetCents:disputeNet,stripeApplicationFeeRefundedCents:Number(fee.amount_refunded??0)});
   if(adjustment){const {error:adjustmentError}=await db.rpc("record_platform_fee_dispute_adjustment",{p_reservation_id:entry.reservation_id,p_provider_dispute_id:dispute.provider_dispute_id,p_provider_charge_id:reservation.provider_charge_id,p_provider_application_fee_id:reservation.provider_application_fee_id,p_connected_account_id:entry.connected_account_id,p_adjustment_type:adjustment.type,p_adjustment_cents:adjustment.amountCents,p_application_fee_refunded_cents:Number(fee.amount_refunded??0),p_event_key:`stripe-dispute:${dispute.provider_dispute_id}:${adjustment.type}:${fee.amount_refunded??0}`});if(adjustmentError)throw new Error(`Dispute fee ledger failed (${adjustmentError.code}).`);}
   await db.from("platform_fee_reconciliation_cases").update({status:"resolved",resolved_at:new Date().toISOString(),last_error:null}).eq("id",entry.id);resolved++;continue;
  }
  let intent:any=null;
  if(entry.provider_payment_intent_id)intent=await stripe.paymentIntents.retrieve(entry.provider_payment_intent_id,{expand:["latest_charge.application_fee"]},{stripeAccount:entry.connected_account_id});
  else if(entry.provider_checkout_session_id){const session=await stripe.checkout.sessions.retrieve(entry.provider_checkout_session_id,{expand:["payment_intent.latest_charge.application_fee"]},{stripeAccount:entry.connected_account_id});if(session.status!=="expired"&&entry.exception_type==="checkout_expiration_uncertain")throw new Error("Checkout session is not definitively expired.");intent=typeof session.payment_intent==="object"?session.payment_intent:null;}
  if(!intent)throw new Error("PaymentIntent unavailable.");const charge=typeof intent.latest_charge==="object"?intent.latest_charge:null,fee=charge&&typeof charge.application_fee==="object"?charge.application_fee:null;
  if(intent.status==="succeeded"){if(!charge?.id||!fee?.id||!Number.isInteger(fee.amount))throw new Error("Successful payment has no verified application fee.");await captureReservedPlatformFee(db,{reservationId:entry.reservation_id,paymentIntentId:intent.id,chargeId:charge.id,applicationFeeId:fee.id,applicationFeeCents:fee.amount,eventId:`reconcile:${entry.id}`});}
  else if(terminalPaymentStates.has(intent.status))await releaseReservedPlatformFee(db,{reservationId:entry.reservation_id,eventId:`reconcile:${entry.id}`,reason:intent.status});
  else throw new Error(`uncertain:${intent.status}`);
  await db.from("platform_fee_reconciliation_cases").update({status:"resolved",resolved_at:new Date().toISOString(),last_error:null}).eq("id",entry.id);resolved++;
 }catch(error){const retry=Number(entry.retry_count)+1,terminal=retry>=8;await db.from("platform_fee_reconciliation_cases").update({status:terminal?"manual_review":"retrying",retry_count:retry,next_retry_at:backoff(retry),last_error:error instanceof Error?error.message:"unknown"}).eq("id",entry.id);failed++;}}
 return{resolved,failed};
}
