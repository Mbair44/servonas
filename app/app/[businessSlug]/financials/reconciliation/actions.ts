"use server";

import {revalidatePath} from "next/cache";
import {canManageCustomers} from "@/lib/access";
import {requireWorkspaceCapability} from "@/lib/workspace";
import {isCancellationReason} from "@/lib/financial/reconciliationResolution";
import {verifyBookingStripePayment} from "@/lib/financial/stripeReconciliation";

const page=(slug:string)=>`/app/${slug}/financials/reconciliation`;
const message=(error:unknown)=>error instanceof Error?error.message:"Unable to complete the reconciliation action.";

export async function cancelReconciliationBooking(slug:string,input:{bookingId:string;reason:string;note?:string;issueType?:string;isTest?:boolean}){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"invoices");
 if(!canManageCustomers(role))return {ok:false,error:"You do not have permission to resolve reconciliation issues."};
 if(!isCancellationReason(input.reason))return {ok:false,error:"Choose a valid cancellation reason."};
 const {error}=await supabase.rpc("resolve_reconciliation_booking_cancellation",{p_business_id:business.id,p_booking_id:input.bookingId,p_reason:input.reason,p_note:input.note?.trim()||null,p_is_test:Boolean(input.isTest),p_issue_type:input.issueType||null});
 if(error)return {ok:false,error:message(error)};
 revalidatePath(page(slug));
 return {ok:true};
}

export async function documentReconciliationException(slug:string,input:{bookingId?:string|null;invoiceId?:string|null;paymentId?:string|null;issueType?:string;reason:string;note:string;differenceCents:number}){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"invoices");
 if(!canManageCustomers(role))return {ok:false,error:"You do not have permission to document reconciliation issues."};
 if(!input.reason.trim()||!input.note.trim())return {ok:false,error:"A reason and note are required."};
 const {error}=await supabase.rpc("document_reconciliation_exception",{p_business_id:business.id,p_booking_id:input.bookingId||null,p_invoice_id:input.invoiceId||null,p_payment_id:input.paymentId||null,p_issue_type:input.issueType||null,p_reason:input.reason.trim(),p_note:input.note.trim(),p_difference_cents:Math.trunc(input.differenceCents)});
 if(error)return {ok:false,error:message(error)};
 revalidatePath(page(slug));
 return {ok:true};
}

export async function verifyReconciliationStripePayment(slug:string,bookingId:string,paymentIntentId?:string|null){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"invoices");
 if(!canManageCustomers(role))return {ok:false,error:"You do not have permission to verify Stripe payments."};
 try{return {ok:true,verification:await verifyBookingStripePayment(supabase,{businessId:business.id,bookingId,paymentIntentId})};}
 catch(error){return {ok:false,error:message(error)};}
}
