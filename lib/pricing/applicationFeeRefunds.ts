import type {SupabaseClient} from "@supabase/supabase-js";
import {queuePlatformFeeReconciliation} from "./feeLifecycle.ts";

type ApplicationFeeRefundStripe={applicationFees:{createRefund:(id:string,params:{amount:number},options:{idempotencyKey:string})=>Promise<{id:string;amount:number;status?:string|null}>}};

/** Returns the additional fee refund after rounding the cumulative customer refund.
 * Cumulative rounding prevents several partial refunds from exceeding the captured fee. */
export function proportionalFeeRefund(capturedFeeCents:number,eligiblePaymentCents:number,customerRefundedBeforeCents:number,customerRefundCents:number,feeRefundedBeforeCents:number){
 if(!Number.isInteger(capturedFeeCents)||!Number.isInteger(eligiblePaymentCents)||!Number.isInteger(customerRefundedBeforeCents)||!Number.isInteger(customerRefundCents)||!Number.isInteger(feeRefundedBeforeCents)||capturedFeeCents<0||eligiblePaymentCents<=0||customerRefundedBeforeCents<0||customerRefundCents<=0||feeRefundedBeforeCents<0)throw new Error("Invalid fee-refund amounts.");
 const totalCustomerRefunded=Math.min(eligiblePaymentCents,customerRefundedBeforeCents+customerRefundCents);
 const target=Math.min(capturedFeeCents,Math.floor((capturedFeeCents*totalCustomerRefunded)/eligiblePaymentCents));
 return Math.max(0,target-feeRefundedBeforeCents);
}

export async function refundCapturedPlatformFee(db:SupabaseClient,stripe:ApplicationFeeRefundStripe,input:{reservationId:string;businessId:string;providerRefundId:string;customerRefundCents:number;eventId:string;connectedAccountId:string|null}){
 const {data:alreadyRecorded,error:alreadyRecordedError}=await db.from("platform_fee_refunds").select("id,status").eq("provider_refund_id",input.providerRefundId).maybeSingle();
 if(alreadyRecordedError)throw new Error("Platform-fee refund idempotency check failed.");
 if(alreadyRecorded?.status==="succeeded")return {refunded:false,reason:"already_recorded" as const};
 const {data:reservation,error:reservationError}=await db.from("platform_fee_reservations").select("id,business_id,state,reserved_fee_cents,eligible_amount_cents,provider_application_fee_id").eq("id",input.reservationId).eq("business_id",input.businessId).maybeSingle();
 if(reservationError||!reservation)throw new Error("Captured platform-fee reservation was not found.");
 if(reservation.state!=="captured"||!reservation.provider_application_fee_id)return {refunded:false,reason:"not_captured" as const};
 const {data:prior,error:priorError}=await db.from("platform_fee_refunds").select("customer_refund_cents,fee_refund_cents,status").eq("reservation_id",input.reservationId).eq("status","succeeded");
 if(priorError)throw new Error("Prior platform-fee refunds could not be read.");
 const customerBefore=(prior??[]).reduce((sum,row)=>sum+Number(row.customer_refund_cents),0);
 const feeBefore=(prior??[]).reduce((sum,row)=>sum+Number(row.fee_refund_cents),0);
 const amount=proportionalFeeRefund(Number(reservation.reserved_fee_cents),Number(reservation.eligible_amount_cents),customerBefore,input.customerRefundCents,feeBefore);
 if(amount===0)return {refunded:false,reason:"nothing_due" as const};
 const {error:pendingError}=await db.from("platform_fee_refunds").upsert({business_id:input.businessId,reservation_id:input.reservationId,provider_refund_id:input.providerRefundId,customer_refund_cents:input.customerRefundCents,fee_refund_cents:amount,status:"pending"},{onConflict:"provider_refund_id",ignoreDuplicates:true});
 if(pendingError)throw new Error("Platform-fee refund retry record could not be saved.");
 try{
  // Application Fees are platform objects even when the underlying charge is direct.
  const providerRefund=await stripe.applicationFees.createRefund(reservation.provider_application_fee_id,{amount},{idempotencyKey:`servonas-fee-refund:${input.providerRefundId}`});
  if(providerRefund.status&&providerRefund.status!=="succeeded")throw new Error(`Application-fee refund is ${providerRefund.status}.`);
  const {error}=await db.rpc("record_platform_fee_refund",{p_reservation_id:input.reservationId,p_provider_refund_id:input.providerRefundId,p_provider_application_fee_refund_id:providerRefund.id,p_customer_refund_cents:input.customerRefundCents,p_fee_refund_cents:amount,p_event_key:`stripe-fee-refund:${input.eventId}`});
  if(error)throw new Error(`Platform-fee refund ledger failed (${error.code}).`);
  return {refunded:true,amount};
 }catch(error){
  await db.from("platform_fee_refunds").update({status:"reconciliation_required"}).eq("provider_refund_id",input.providerRefundId).neq("status","succeeded");
  await queuePlatformFeeReconciliation(db,{businessId:input.businessId,reservationId:input.reservationId,connectedAccountId:input.connectedAccountId,type:"refund_uncertain",error:error instanceof Error?error.message:"Application-fee refund uncertain"}).catch(()=>undefined);
  throw error;
 }
}
