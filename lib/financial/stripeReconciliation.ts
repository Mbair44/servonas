import Stripe from "stripe";
import type {SupabaseClient} from "@supabase/supabase-js";
import {stripeClient, stripeProviderError} from "@/lib/stripeConnect";

export type StripeVerification={state:"verified"|"missing_in_stripe"|"missing_in_servonas"|"amount_mismatch"|"status_mismatch"|"refund_mismatch"|"duplicate_reference"|"verification_failed";paymentIntentId:string;connectedAccountId:string;amountCents:number;amountReceivedCents:number;currency:string;status:string;createdAt:string;chargeId:string|null;paymentMethod:string|null;refundCents:number;localAmountCents:number;localRefundCents:number;message:string};

export async function verifyBookingStripePayment(db:SupabaseClient,input:{businessId:string;bookingId:string;paymentIntentId?:string|null},stripe=stripeClient()):Promise<StripeVerification>{
 const [{data:account},{data:booking}]=await Promise.all([
  db.from("business_payment_accounts").select("provider_account_id").eq("business_id",input.businessId).eq("provider","stripe").maybeSingle(),
  db.from("bookings").select("id,business_id,stripe_payment_intent_id").eq("id",input.bookingId).eq("business_id",input.businessId).maybeSingle(),
 ]);
 if(!booking)throw new Error("Booking not found for this business.");
 if(!account?.provider_account_id)throw new Error("No Stripe connected account is configured for this business.");
 const paymentIntentId=input.paymentIntentId??booking.stripe_payment_intent_id;
 if(!paymentIntentId)throw new Error("This booking has no stored Stripe PaymentIntent reference.");
 const {data:payments}=await db.from("payments").select("id,amount_cents,refunded_amount_cents,provider_payment_intent_id,status").eq("business_id",input.businessId).eq("booking_id",input.bookingId).eq("provider","stripe");
 const matching=(payments??[]).filter(payment=>payment.provider_payment_intent_id===paymentIntentId);
 try{
  const intent=await stripe.paymentIntents.retrieve(paymentIntentId,{expand:["latest_charge","latest_charge.refunds"]},{stripeAccount:account.provider_account_id});
  const charge=typeof intent.latest_charge==="object"?intent.latest_charge as Stripe.Charge:null;
  const localAmount=matching.reduce((sum,p)=>sum+Number(p.amount_cents??0),0),localRefund=matching.reduce((sum,p)=>sum+Number(p.refunded_amount_cents??0),0),refundCents=Number(charge?.amount_refunded??0),succeeded=intent.status==="succeeded";
  const state:StripeVerification["state"]=matching.length>1?"duplicate_reference":!matching.length&&succeeded?"missing_in_servonas":!succeeded&&matching.some(payment=>payment.status==="succeeded")?"status_mismatch":matching.length&&localAmount!==Number(intent.amount_received??0)?"amount_mismatch":matching.length&&localRefund!==refundCents?"refund_mismatch":"verified";
  const paymentMethod=typeof intent.payment_method==="object"?intent.payment_method:null;
  const card=paymentMethod?.card; const summary=card?`${card.brand} •••• ${card.last4}`:null;
  return {state,paymentIntentId,connectedAccountId:account.provider_account_id,amountCents:Number(intent.amount),amountReceivedCents:Number(intent.amount_received),currency:intent.currency.toUpperCase(),status:intent.status,createdAt:new Date(intent.created*1000).toISOString(),chargeId:charge?.id??null,paymentMethod:summary,refundCents,localAmountCents:localAmount,localRefundCents:localRefund,message:state==="verified"?"Stripe and Servonas agree.":state==="missing_in_servonas"?"Stripe shows a successful payment with no matching Servonas ledger entry.":"Stripe and Servonas do not agree."};
 }catch(error){const detail=stripeProviderError(error);if(detail.statusCode===404)return {state:"missing_in_stripe",paymentIntentId,connectedAccountId:account.provider_account_id,amountCents:0,amountReceivedCents:0,currency:"USD",status:"missing",createdAt:new Date().toISOString(),chargeId:null,paymentMethod:null,refundCents:0,localAmountCents:matching.reduce((sum,p)=>sum+Number(p.amount_cents??0),0),localRefundCents:matching.reduce((sum,p)=>sum+Number(p.refunded_amount_cents??0),0),message:"Stripe could not find this PaymentIntent in this business’s connected account."};throw new Error(`Stripe verification failed: ${detail.message}`);}
}
