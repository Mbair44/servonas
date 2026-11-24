import type {SupabaseClient} from "@supabase/supabase-js";
import {getPricingProfile} from "./profile.ts";
import {validateEligiblePaymentAllocation,type EligiblePaymentAllocation} from "./paymentAllocation.ts";
export async function persistPaymentAllocation(db:SupabaseClient,input:{businessId:string;paymentKey:string;sourceReference:string;allocation:EligiblePaymentAllocation}){
 const profile=await getPricingProfile(db,input.businessId);if(profile.planKey==="legacy"||!profile.rolloutEnabled)return null;
 const a=validateEligiblePaymentAllocation(input.allocation);
 const row={business_id:input.businessId,payment_key:input.paymentKey,charged_amount_cents:a.expectedPaymentCents,eligible_amount_cents:a.expectedPaymentCents,eligible_charge_cents:a.eligibleChargeCents,eligible_tax_cents:a.eligibleTaxCents,tax_split_status:a.taxSplitStatus,tips_cents:0,refundable_security_deposit_cents:0,overpayment_cents:0,currency:a.currency,allocation_version:a.version,payment_flow:a.flow,allocation_reason:`source:${input.sourceReference}`};
 const {data,error}=await db.from("platform_payment_allocations").insert(row).select("id,charged_amount_cents,eligible_amount_cents,payment_flow").maybeSingle();
 if(!error)return data;
 if(error.code!=="23505")throw new Error(`Payment allocation could not be persisted (${error.code}).`);
 const {data:existing,error:readError}=await db.from("platform_payment_allocations").select("id,charged_amount_cents,eligible_amount_cents,payment_flow").eq("business_id",input.businessId).eq("payment_key",input.paymentKey).maybeSingle();
 if(readError||!existing||Number(existing.charged_amount_cents)!==a.expectedPaymentCents||Number(existing.eligible_amount_cents)!==a.expectedPaymentCents||existing.payment_flow!==a.flow)throw new Error("Conflicting payment allocation retry.");
 return existing;
}
export async function associatePaymentAllocationCheckout(db:SupabaseClient,input:{allocationId:string|null;businessId:string;checkoutSessionId:string}){
 if(!input.allocationId)return;
 const {error}=await db.from("platform_payment_allocations").update({provider_checkout_session_id:input.checkoutSessionId}).eq("id",input.allocationId).eq("business_id",input.businessId).is("provider_checkout_session_id",null);
 if(error&&error.code!=="23505")throw new Error(`Payment allocation could not be associated (${error.code}).`);
}
export async function associatePaymentAllocationIntent(db:SupabaseClient,input:{allocationId:string|null;businessId:string;paymentIntentId:string}){if(!input.allocationId)return;const {error}=await db.from("platform_payment_allocations").update({provider_payment_intent_id:input.paymentIntentId}).eq("id",input.allocationId).eq("business_id",input.businessId).is("provider_payment_intent_id",null);if(error&&error.code!=="23505")throw new Error(`Payment allocation could not be associated (${error.code}).`);}
