import Stripe from "stripe";
import type {SupabaseClient} from "@supabase/supabase-js";

/** Posts a customer-paid balance through the same invoice ledger transition as Stripe webhooks. */
export async function fulfillCustomerBalanceCheckoutPayment(db:SupabaseClient,input:{businessId:string;bookingId:string;connectedAccountId:string;session:Stripe.Checkout.Session;intent:Stripe.PaymentIntent;source:"webhook"|"repair"}){
 const paymentIntentId=input.intent.id,charge=typeof input.intent.latest_charge==="object"?input.intent.latest_charge as Stripe.Charge:null;
 const {data:booking,error:bookingError}=await db.from("bookings").select("id,business_id,job_id,customer_id,status,balance_due_cents").eq("id",input.bookingId).eq("business_id",input.businessId).maybeSingle();
 if(bookingError||!booking)throw new Error("Booking was not found for this payment.");
 const {data:invoice}=booking.job_id?await db.from("invoices").select("id,status").eq("business_id",input.businessId).eq("job_id",booking.job_id).eq("is_deleted",false).not("status","in","(void,refunded)").maybeSingle():{data:null};
 if(!invoice)throw new Error("No active invoice exists for this booking balance payment.");
 let {data:payment}=await db.from("payments").select("id,status").eq("business_id",input.businessId).eq("provider","stripe").eq("provider_account_id",input.connectedAccountId).eq("provider_payment_intent_id",paymentIntentId).maybeSingle();
 if(!payment){
  const inserted=await db.from("payments").insert({business_id:input.businessId,customer_id:booking.customer_id,booking_id:booking.id,invoice_id:invoice.id,job_id:booking.job_id,provider:"stripe",provider_account_id:input.connectedAccountId,provider_customer_id:typeof input.intent.customer==="string"?input.intent.customer:null,provider_payment_intent_id:paymentIntentId,provider_checkout_session_id:input.session.id,provider_charge_id:charge?.id??null,amount_cents:Number(input.intent.amount_received),currency:input.intent.currency.toUpperCase(),status:"pending",payment_method_type:input.intent.payment_method_types?.[0]??"card",idempotency_key:`customer-balance:${input.connectedAccountId}:${paymentIntentId}`,net_amount_cents:0}).select("id,status").single();
  if(inserted.error&&inserted.error.code!=="23505")throw new Error(`Could not create payment ledger record (${inserted.error.code}).`);
  payment=inserted.data??(await db.from("payments").select("id,status").eq("business_id",input.businessId).eq("provider","stripe").eq("provider_account_id",input.connectedAccountId).eq("provider_payment_intent_id",paymentIntentId).maybeSingle()).data;
 }
 if(!payment)throw new Error("Payment ledger record could not be loaded.");
 const {error}=await db.rpc("reconcile_invoice_online_payment",{p_business_id:input.businessId,p_payment_id:payment.id,p_status:"succeeded",p_payment_intent_id:paymentIntentId,p_charge_id:charge?.id??null,p_payment_method_type:input.intent.payment_method_types?.[0]??"card",p_receipt_url:charge?.receipt_url??null,p_failure_code:null,p_failure_message:null,p_occurred_at:new Date(input.intent.created*1000).toISOString()});
 if(error)throw new Error(`Invoice payment reconciliation failed (${error.code}).`);
 await db.from("bookings").update({balance_charge_scheduled_for:null}).eq("id",booking.id).eq("business_id",input.businessId).eq("balance_due_cents",0);
 await db.from("payment_attempts").update({status:"canceled",completed_at:new Date().toISOString(),failure_code:"already_paid",failure_reason:"Balance paid through customer payment link"}).eq("business_id",input.businessId).eq("invoice_id",invoice.id).in("status",["pending","failed"]);
 await db.from("billing_audit_events").insert({business_id:input.businessId,customer_id:booking.customer_id,job_id:booking.job_id,invoice_id:invoice.id,payment_id:payment.id,event_type:"customer_balance_payment_fulfilled",metadata:{source:input.source,booking_id:booking.id,payment_intent_id:paymentIntentId,checkout_session_id:input.session.id,amount_cents:Number(input.intent.amount_received)}});
 return {paymentId:payment.id,invoiceId:invoice.id};
}
