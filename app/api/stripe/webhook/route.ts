import { NextResponse } from "next/server";
import Stripe from "stripe";
import {ensureRentalBookingJob,RentalBookingJobPersistenceError} from "@/lib/rentalBookingJob";
import {sendRentalBookingBusinessNotification,sendRentalBookingConfirmationEmail} from "@/lib/communications/rentalBookingEmailService";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendBookingSms } from "@/lib/sms";
import { stripeConnectState } from "@/lib/stripeConnect";
import { sendInvoiceFinancialEmail } from "@/lib/communications/invoiceEmailService";
import {recordBookingFunnelEvent} from "@/lib/bookingFunnel";
import {createBusinessNotification} from "@/lib/businessNotifications";
import {fulfillPaidRentalBooking} from "@/lib/rentalPaymentFulfillment";

export const runtime = "nodejs";

type AdminClient=NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type DatabaseError={code?:string;message?:string;details?:string;hint?:string};

function sanitizedDatabaseError(error:DatabaseError|null|undefined){
 return error?{code:error.code??null,message:error.message??null,details:error.details??null,hint:error.hint??null}:null;
}

class PaidRentalWebhookError extends Error{
 constructor(
  message:string,
  readonly operation:string,
  readonly resource:string,
  readonly downstreamStatus:number|null=null,
  readonly downstreamResponse:ReturnType<typeof sanitizedDatabaseError>=null,
 ){super(message);this.name="PaidRentalWebhookError";}
}

function requireDatabaseSuccess(error:DatabaseError|null|undefined,operation:string,resource:string){
 if(error)throw new PaidRentalWebhookError(`${operation} failed (${error.code??"unknown"}).`,operation,resource,400,sanitizedDatabaseError(error));
}

async function payloadHash(rawBody:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(rawBody));
  return Buffer.from(digest).toString("hex");
}

function invoicePaymentReference(event:Stripe.Event){
  const object=event.data.object;
  if("metadata" in object&&object.metadata?.servonas_kind==="invoice_payment"){
    return object.metadata.payment_id??("client_reference_id" in object?object.client_reference_id:null);
  }
  return null;
}

async function processInvoicePaymentEvent(
  event:Stripe.Event,
  rawBody:string,
  stripe:Stripe,
  supabase:AdminClient,
){
  const paymentId=invoicePaymentReference(event);
  if(!paymentId)return null;
  const accountId=typeof event.account==="string"?event.account:null;
  if(!accountId){
    console.error("Invoice payment webhook missing connected account",{eventId:event.id,eventType:event.type,paymentId});
    return NextResponse.json({error:"Connected account is required."},{status:400});
  }
  const ledger=await supabase.from("payment_webhook_events").insert({
    provider:"stripe",provider_event_id:event.id,provider_account_id:accountId,event_type:event.type,
    processing_status:"processing",attempt_count:1,payload_hash:await payloadHash(rawBody),safe_metadata:{payment_id:paymentId},
  }).select("id").single();
  if(ledger.error?.code==="23505")return NextResponse.json({received:true,duplicate:true});
  if(ledger.error||!ledger.data){
    console.error("Invoice payment webhook ledger failed",{eventId:event.id,eventType:event.type,code:ledger.error?.code});
    return NextResponse.json({error:"Webhook ledger unavailable."},{status:500});
  }
  const ledgerId=ledger.data.id;
  try{
    const {data:payment,error:lookupError}=await supabase.from("payments")
      .select("id,business_id,invoice_id,provider_account_id,status")
      .eq("id",paymentId).eq("provider","stripe").eq("provider_account_id",accountId).maybeSingle();
    if(lookupError)throw new Error(`Payment lookup failed (${lookupError.code}).`);
    if(!payment){
      await supabase.from("payment_webhook_events").update({
        processing_status:"ignored",processed_at:new Date().toISOString(),safe_metadata:{payment_id:paymentId,reason:"payment_not_found_for_account"},
      }).eq("id",ledgerId);
      console.warn("Invoice payment webhook ignored",{eventId:event.id,eventType:event.type,paymentId,accountId,reason:"payment_not_found_for_account"});
      return NextResponse.json({received:true,ignored:true});
    }
    let status:"requires_action"|"processing"|"succeeded"|"failed"|"canceled";
    let intent:Stripe.PaymentIntent|null=null;
    if(event.type.startsWith("checkout.session.")){
      const eventSession=event.data.object as Stripe.Checkout.Session;
      const session=await stripe.checkout.sessions.retrieve(eventSession.id,{expand:["payment_intent.latest_charge"]},{stripeAccount:accountId});
      intent=typeof session.payment_intent==="object"?session.payment_intent:null;
      status=event.type==="checkout.session.expired"?"canceled":
        event.type==="checkout.session.async_payment_failed"?"failed":
        session.payment_status==="paid"?"succeeded":"processing";
    }else{
      const eventIntent=event.data.object as Stripe.PaymentIntent;
      intent=await stripe.paymentIntents.retrieve(eventIntent.id,{expand:["latest_charge"]},{stripeAccount:accountId});
      status=event.type==="payment_intent.succeeded"?"succeeded":
        event.type==="payment_intent.payment_failed"?"failed":
        event.type==="payment_intent.requires_action"?"requires_action":"processing";
    }
    const charge=intent&&typeof intent.latest_charge==="object"?intent.latest_charge as Stripe.Charge:null;
    const paymentMethod=intent?.payment_method_types?.[0]??null;
    const occurredAt=new Date(event.created*1000).toISOString();
    const {data:reconciled,error:reconcileError}=await supabase.rpc("reconcile_invoice_online_payment",{
      p_business_id:payment.business_id,p_payment_id:payment.id,p_status:status,
      p_payment_intent_id:intent?.id??null,p_charge_id:charge?.id??null,
      p_payment_method_type:paymentMethod,p_receipt_url:charge?.receipt_url??null,
      p_failure_code:intent?.last_payment_error?.code??null,p_failure_message:intent?.last_payment_error?.message??null,
      p_occurred_at:occurredAt,
    });
    if(reconcileError)throw new Error(`Payment reconciliation failed (${reconcileError.code}).`);
    const invoiceId=reconciled?.[0]?.invoice_id;
    if(invoiceId){
      const notification=status==="failed"?"payment_failed":status==="succeeded"?(reconciled[0].invoice_status==="paid"?"invoice_paid":"partial_payment"):null;
      if(notification)await sendInvoiceFinancialEmail(invoiceId,notification,{paymentId:payment.id});
      if(status==="succeeded")await sendInvoiceFinancialEmail(invoiceId,"receipt_sent",{paymentId:payment.id});
    }
    await supabase.from("payment_webhook_events").update({
      processing_status:"processed",processed_at:new Date().toISOString(),
      safe_metadata:{payment_id:payment.id,business_id:payment.business_id,invoice_id:payment.invoice_id,status},
    }).eq("id",ledgerId);
    return NextResponse.json({received:true});
  }catch(error){
    const message=error instanceof Error?error.message:"Unknown invoice payment webhook error.";
    await supabase.from("payment_webhook_events").update({processing_status:"failed",last_error:message.slice(0,1000)}).eq("id",ledgerId);
    console.error("Invoice payment webhook processing failed",{eventId:event.id,eventType:event.type,paymentId,accountId,message});
    return NextResponse.json({error:"Invoice payment processing failed."},{status:500});
  }
}

async function processInvoiceRefundEvent(event:Stripe.Event,rawBody:string,supabase:AdminClient){
  const refund=event.data.object as Stripe.Refund;
  if(refund.metadata?.servonas_kind!=="invoice_refund"||!refund.metadata.refund_id)return null;
  const refundId=refund.metadata.refund_id;
  const accountId=typeof event.account==="string"?event.account:null;
  if(!accountId)return NextResponse.json({error:"Connected account is required."},{status:400});
  const ledger=await supabase.from("payment_webhook_events").insert({
    provider:"stripe",provider_event_id:event.id,provider_account_id:accountId,event_type:event.type,
    processing_status:"processing",attempt_count:1,payload_hash:await payloadHash(rawBody),safe_metadata:{refund_id:refundId},
  }).select("id").single();
  if(ledger.error?.code==="23505")return NextResponse.json({received:true,duplicate:true});
  if(ledger.error||!ledger.data){
    console.error("Invoice refund webhook ledger failed",{eventId:event.id,eventType:event.type,code:ledger.error?.code});
    return NextResponse.json({error:"Webhook ledger unavailable."},{status:500});
  }
  try{
    const {data:refundRecord,error:refundError}=await supabase.from("payment_refunds")
      .select("id,business_id,payment_id").eq("id",refundId).maybeSingle();
    if(refundError)throw new Error(`Refund lookup failed (${refundError.code}).`);
    const {data:payment,error:paymentError}=refundRecord?await supabase.from("payments")
      .select("id,provider_account_id,invoice_id").eq("id",refundRecord.payment_id).eq("business_id",refundRecord.business_id).maybeSingle():{data:null,error:null};
    if(paymentError)throw new Error(`Refund payment lookup failed (${paymentError.code}).`);
    if(!refundRecord||payment?.provider_account_id!==accountId){
      await supabase.from("payment_webhook_events").update({
        processing_status:"ignored",processed_at:new Date().toISOString(),safe_metadata:{refund_id:refundId,reason:"refund_not_found_for_account"},
      }).eq("id",ledger.data.id);
      return NextResponse.json({received:true,ignored:true});
    }
    const status=refund.status==="succeeded"?"succeeded":refund.status==="failed"?"failed":
      refund.status==="canceled"?"canceled":refund.status==="requires_action"?"requires_action":"pending";
    const {error:reconcileError}=await supabase.rpc("reconcile_invoice_refund",{
      p_business_id:refundRecord.business_id,p_refund_id:refundRecord.id,p_status:status,
      p_provider_refund_id:refund.id,p_failure_message:refund.failure_reason??null,
      p_completed_at:status==="succeeded"?new Date(event.created*1000).toISOString():null,
    });
    if(reconcileError)throw new Error(`Refund reconciliation failed (${reconcileError.code}).`);
    if(status==="succeeded"&&payment?.invoice_id)await sendInvoiceFinancialEmail(payment.invoice_id,"refund_issued",{paymentId:payment.id,refundId:refundRecord.id});
    await supabase.from("payment_webhook_events").update({
      processing_status:"processed",processed_at:new Date().toISOString(),
      safe_metadata:{refund_id:refundId,business_id:refundRecord.business_id,payment_id:refundRecord.payment_id,status},
    }).eq("id",ledger.data.id);
    return NextResponse.json({received:true});
  }catch(error){
    const message=error instanceof Error?error.message:"Unknown invoice refund webhook error.";
    await supabase.from("payment_webhook_events").update({processing_status:"failed",last_error:message.slice(0,1000)}).eq("id",ledger.data.id);
    console.error("Invoice refund webhook processing failed",{eventId:event.id,eventType:event.type,refundId,accountId,message});
    return NextResponse.json({error:"Invoice refund processing failed."},{status:500});
  }
}

async function beginPaidRentalEvent(event:Stripe.Event,rawBody:string,supabase:AdminClient,bookingId:string,businessId:string|null){
 const accountId=typeof event.account==="string"?event.account:null;
 const inserted=await supabase.from("payment_webhook_events").insert({
  provider:"stripe",provider_event_id:event.id,provider_account_id:accountId,event_type:event.type,
  processing_status:"processing",attempt_count:1,payload_hash:await payloadHash(rawBody),
  safe_metadata:{booking_id:bookingId,business_id:businessId,workflow:"rental_booking"},
 }).select("id,processing_status,attempt_count").single();
 if(!inserted.error&&inserted.data)return {id:inserted.data.id,duplicate:false};
 if(inserted.error?.code!=="23505")throw new PaidRentalWebhookError("Paid rental webhook ledger is unavailable.","webhook_ledger_insert","payment_webhook_events",400,sanitizedDatabaseError(inserted.error));
 const existing=await supabase.from("payment_webhook_events").select("id,processing_status,attempt_count").eq("provider","stripe").eq("provider_event_id",event.id).maybeSingle();
 requireDatabaseSuccess(existing.error,"webhook_ledger_lookup","payment_webhook_events");
 if(!existing.data)throw new PaidRentalWebhookError("Paid rental webhook ledger entry was not found.","webhook_ledger_lookup","payment_webhook_events");
 if(existing.data.processing_status==="processed")return {id:existing.data.id,duplicate:true};
 const retried=await supabase.from("payment_webhook_events").update({
  processing_status:"processing",attempt_count:Number(existing.data.attempt_count??0)+1,last_error:null,
  safe_metadata:{booking_id:bookingId,business_id:businessId,workflow:"rental_booking",retry:true},
 }).eq("id",existing.data.id);
 requireDatabaseSuccess(retried.error,"webhook_ledger_retry","payment_webhook_events");
 return {id:existing.data.id,duplicate:false};
}

async function recordPaidRentalFailure(input:{
 supabase:AdminClient;ledgerId:string|null;event:Stripe.Event;bookingId:string;businessId:string|null;businessSlug:string|null;
 checkoutSessionId:string;paymentIntentId:string|null;customerId:string|null;jobId:string|null;error:unknown;
}){
 const failure=input.error instanceof PaidRentalWebhookError?input.error:input.error instanceof RentalBookingJobPersistenceError
  ?new PaidRentalWebhookError(input.error.message,input.error.operation,input.error.resource,400,sanitizedDatabaseError(input.error.databaseError))
  :new PaidRentalWebhookError(input.error instanceof Error?input.error.message:"Unknown paid rental fulfillment failure.","rental_fulfillment","bookings/jobs");
 const recovery={
  businessId:input.businessId,businessSlug:input.businessSlug,stripeEventId:input.event.id,stripeEventType:input.event.type,
  checkoutSessionId:input.checkoutSessionId,paymentIntentId:input.paymentIntentId,bookingId:input.bookingId,
  customerId:input.customerId,jobId:input.jobId,failingOperation:failure.operation,downstreamResource:failure.resource,
  downstreamStatus:failure.downstreamStatus,downstreamResponse:failure.downstreamResponse,message:failure.message,retryState:"retryable",
 };
 if(input.ledgerId)await input.supabase.from("payment_webhook_events").update({
  processing_status:"failed",last_error:failure.message.slice(0,1000),safe_metadata:{workflow:"rental_booking",...recovery},
 }).eq("id",input.ledgerId);
 console.error("PAID BOOKING FAILED TO CREATE JOB",recovery);
 if(input.businessId){
  try{await createBusinessNotification({
   businessId:input.businessId,type:"paid_booking_job_creation_failed",category:"payments",title:"Paid booking failed to create job",
   body:"Stripe confirmed this payment, but Servonas could not finish the operational job. The payment must not be charged again.",
   priority:"urgent",actionLabel:"Review booking",actionUrl:input.businessSlug?`/app/${input.businessSlug}/jobs`:null,
   externalResourceId:input.bookingId,dedupeKey:`paid-booking-job-failure:${input.bookingId}`,
   metadata:{stripeEventId:input.event.id,checkoutSessionId:input.checkoutSessionId,paymentIntentId:input.paymentIntentId,bookingId:input.bookingId,customerId:input.customerId,jobId:input.jobId,failingOperation:failure.operation,retryState:"retryable"},
  });}catch(notificationError){console.error("Paid booking failure notification could not be saved",{businessId:input.businessId,bookingId:input.bookingId,message:notificationError instanceof Error?notificationError.message:"unknown"});}
 }
}

export async function POST(request: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const supabase = getSupabaseAdmin();
  if (!stripeKey || (!webhookSecret && !connectWebhookSecret) || !supabase) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  const stripe = new Stripe(stripeKey);
  let event: Stripe.Event|null=null;
  const rawBody = await request.text();
  let signatureError:unknown;
  for(const secret of [...new Set([connectWebhookSecret,webhookSecret].filter(Boolean) as string[])]){
    try{event=stripe.webhooks.constructEvent(rawBody,signature,secret);break;}
    catch(error){signatureError=error;}
  }
  if(!event){
    console.error("Invalid Stripe webhook signature:", signatureError);
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const eventInsert = await supabase.from("payment_webhook_events").insert({
      provider: "stripe", provider_event_id: event.id, provider_account_id: account.id,
      event_type: event.type, processing_status: "processing", attempt_count: 1,
      payload_hash: await payloadHash(rawBody), safe_metadata: {},
    }).select("id").single();
    if (eventInsert.error?.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (eventInsert.error || !eventInsert.data) {
      console.error("Stripe account webhook ledger failed", { eventId: event.id, code: eventInsert.error?.code });
      return NextResponse.json({ error: "Webhook ledger unavailable." }, { status: 500 });
    }
    const { data: paymentAccount, error: lookupError } = await supabase.from("business_payment_accounts")
      .select("business_id").eq("provider", "stripe").eq("provider_account_id", account.id).maybeSingle();
    if (lookupError) {
      await supabase.from("payment_webhook_events").update({
        processing_status: "failed", last_error: `Account lookup failed (${lookupError.code}).`,
      }).eq("id", eventInsert.data.id);
      console.error("Stripe account webhook tenant lookup failed", { eventId: event.id, accountId: account.id, code: lookupError.code });
      return NextResponse.json({ error: "Account lookup failed." }, { status: 500 });
    }
    if (!paymentAccount) {
      await supabase.from("payment_webhook_events").update({
        processing_status: "ignored", processed_at: new Date().toISOString(),
        safe_metadata: { reason: "connected_account_not_registered" },
      }).eq("id", eventInsert.data.id);
      console.warn("Stripe account webhook ignored", { eventId: event.id, accountId: account.id, reason: "not_registered" });
      return NextResponse.json({ received: true, ignored: true });
    }
    const state = stripeConnectState(account);
    const { error: updateError } = await supabase.from("business_payment_accounts").update(state)
      .eq("business_id", paymentAccount.business_id).eq("provider", "stripe").eq("provider_account_id", account.id);
    if (updateError) {
      await supabase.from("payment_webhook_events").update({
        processing_status: "failed", last_error: `Account update failed (${updateError.code}).`,
        safe_metadata: { business_id: paymentAccount.business_id },
      }).eq("id", eventInsert.data.id);
      console.error("Stripe account webhook update failed", {
        eventId: event.id, accountId: account.id, businessId: paymentAccount.business_id, code: updateError.code,
      });
      return NextResponse.json({ error: "Account status update failed." }, { status: 500 });
    }
    await supabase.from("payment_webhook_events").update({
      processing_status: "processed", processed_at: new Date().toISOString(),
      safe_metadata: { business_id: paymentAccount.business_id, onboarding_status: state.onboarding_status },
    }).eq("id", eventInsert.data.id);
    return NextResponse.json({ received: true });
  }

  if([
    "checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.async_payment_failed","checkout.session.expired",
    "payment_intent.processing","payment_intent.requires_action","payment_intent.payment_failed","payment_intent.succeeded",
  ].includes(event.type)){
    const response=await processInvoicePaymentEvent(event,rawBody,stripe,supabase);
    if(response)return response;
  }

  if(["refund.created","refund.updated","refund.failed"].includes(event.type)){
    const response=await processInvoiceRefundEvent(event,rawBody,supabase);
    if(response)return response;
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const eventSession = event.data.object as Stripe.Checkout.Session;
    const bookingId = eventSession.metadata?.booking_id;
    if (bookingId && eventSession.payment_status === "paid") {
      let ledgerId:string|null=null,jobId:string|null=null,customerId:string|null=null,businessId=eventSession.metadata?.business_id??null,businessSlug:string|null=null;
      let paymentIntentId=typeof eventSession.payment_intent==="string"?eventSession.payment_intent:eventSession.payment_intent?.id??null;
      try{
        const ledger=await beginPaidRentalEvent(event,rawBody,supabase,bookingId,businessId);
        ledgerId=ledger.id;
        if(ledger.duplicate)return NextResponse.json({received:true,duplicate:true});
        const session=await stripe.checkout.sessions.retrieve(eventSession.id,{
          expand:["discounts.promotion_code","discounts.coupon","payment_intent.payment_method"],
        },typeof event.account==="string"?{stripeAccount:event.account}:undefined);
        paymentIntentId=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id??null;
        const finalTotalCents=Number(session.metadata?.total_cents||0),amountPaidCents=Number(session.amount_total||0),discountCents=Number(session.metadata?.discount_cents||0);
        businessId=session.metadata?.business_id??businessId;
        if(businessId){const business=await supabase.from("businesses").select("slug").eq("id",businessId).maybeSingle();businessSlug=business.data?.slug??null;}
        const discount=session.discounts?.[0],promotionCode=discount&&typeof discount!=="string"&&discount.promotion_code,coupon=discount&&typeof discount!=="string"&&discount.coupon;
        const promotionCodeId=typeof promotionCode==="string"?promotionCode:promotionCode&&typeof promotionCode==="object"?promotionCode.id:null;
        const couponId=typeof coupon==="string"?coupon:coupon&&typeof coupon==="object"?coupon.id:null;
        const intent=typeof session.payment_intent==="object"?session.payment_intent:null;
        const paymentMethod=intent&&typeof intent.payment_method==="object"?intent.payment_method as Stripe.PaymentMethod:null;
        const providerCustomerId=typeof session.customer==="string"?session.customer:session.customer?.id??null;
        jobId=await fulfillPaidRentalBooking({
          confirmBooking:async()=>{
            const confirmed=await supabase.from("bookings").update({
              status:"confirmed",stripe_checkout_session_id:session.id,stripe_payment_intent_id:paymentIntentId,
              deposit_cents:amountPaidCents,amount_paid_cents:amountPaidCents,discount_cents:discountCents,
              balance_due_cents:Math.max(0,finalTotalCents-amountPaidCents),discount_id:session.metadata?.discount_id||null,
              discount_code:session.metadata?.discount_code||null,discount_name:session.metadata?.discount_name||null,
              stripe_promotion_code_id:promotionCodeId,stripe_coupon_id:couponId,paid_at:new Date().toISOString(),
            }).eq("id",bookingId).select("id,business_id,customer_id,job_id").maybeSingle();
            requireDatabaseSuccess(confirmed.error,"confirm_paid_booking","bookings");
            if(!confirmed.data)throw new PaidRentalWebhookError("The paid booking record was not found.","confirm_paid_booking","bookings",404,null);
            if(businessId&&confirmed.data.business_id!==businessId)throw new PaidRentalWebhookError("The paid booking tenant does not match Stripe metadata.","verify_booking_tenant","bookings",409,null);
            businessId=confirmed.data.business_id??businessId;customerId=confirmed.data.customer_id??null;jobId=confirmed.data.job_id??null;
          },
          confirmItems:async()=>{const result=await supabase.from("booking_items").update({status:"confirmed"}).eq("booking_id",bookingId);requireDatabaseSuccess(result.error,"confirm_booking_items","booking_items");},
          ensureJob:async()=>ensureRentalBookingJob(supabase,bookingId),
          saveFinalPaymentAuthorization:async()=>{
            if(session.metadata?.final_payment_authorized!=="true")return;
            if(!providerCustomerId||!paymentMethod?.id)throw new PaidRentalWebhookError("Stripe did not return the authorized customer payment method.","save_final_payment_authorization","bookings",422,null);
            const result=await supabase.from("bookings").update({final_payment_authorized_at:new Date(event.created*1000).toISOString(),stripe_customer_id:providerCustomerId,stripe_payment_method_id:paymentMethod.id}).eq("id",bookingId);
            requireDatabaseSuccess(result.error,"save_final_payment_authorization","bookings");
          },
        });
        if(businessId){const redemption=await supabase.rpc("finalize_discount_redemption",{p_business_id:businessId,p_booking_id:bookingId});requireDatabaseSuccess(redemption.error,"finalize_discount_redemption","rpc/finalize_discount_redemption");}
        const processed=await supabase.from("payment_webhook_events").update({processing_status:"processed",processed_at:new Date().toISOString(),last_error:null,safe_metadata:{workflow:"rental_booking",business_id:businessId,business_slug:businessSlug,booking_id:bookingId,job_id:jobId,checkout_session_id:session.id,payment_intent_id:paymentIntentId,payment_status:"succeeded"}}).eq("id",ledgerId);
        requireDatabaseSuccess(processed.error,"webhook_ledger_complete","payment_webhook_events");
        if(businessId)await supabase.from("business_notifications").update({status:"resolved",resolved_at:new Date().toISOString(),updated_at:new Date().toISOString(),metadata:{bookingId,jobId,retryState:"recovered"}}).eq("business_id",businessId).eq("dedupe_key",`paid-booking-job-failure:${bookingId}`);
        if(businessId)await Promise.allSettled([
          recordBookingFunnelEvent(supabase,{businessId,sessionId:session.metadata?.attribution_session_id,event:"booking_completed",eventKey:`${bookingId}:booking_completed`,bookingId,inventoryItemId:session.metadata?.inventory_item_ids?.split(",")[0]??null,metadata:{payment_mode:"stripe",item_count:Number(session.metadata?.item_count??0)},bookingTotalCents:finalTotalCents,amountPaidCents,currency:String(session.currency??"usd").toUpperCase()}),
          recordBookingFunnelEvent(supabase,{businessId,sessionId:session.metadata?.attribution_session_id,event:"payment_completed",eventKey:`${bookingId}:payment_completed`,bookingId,inventoryItemId:session.metadata?.inventory_item_ids?.split(",")[0]??null,metadata:{payment_mode:"stripe",item_count:Number(session.metadata?.item_count??0)},bookingTotalCents:finalTotalCents,amountPaidCents,currency:String(session.currency??"usd").toUpperCase()}),
        ]);
        const [emailResult,businessEmailResult]=await Promise.all([sendRentalBookingConfirmationEmail(bookingId,jobId),sendRentalBookingBusinessNotification(bookingId,jobId)]);
        if(!emailResult.ok||!businessEmailResult.ok)console.error("Paid rental email delivery was incomplete",{bookingId,jobId,customerError:emailResult.ok?null:emailResult.error,businessError:businessEmailResult.ok?null:businessEmailResult.error});
        try{
          if(paymentIntentId){const paymentIntent=await stripe.paymentIntents.retrieve(paymentIntentId,{expand:["latest_charge"]},typeof event.account==="string"?{stripeAccount:event.account}:undefined);const charge=typeof paymentIntent.latest_charge==="object"?paymentIntent.latest_charge as Stripe.Charge:null;if(charge?.receipt_url)await supabase.from("bookings").update({stripe_receipt_url:charge.receipt_url}).eq("id",bookingId);}
          const {data:current}=await supabase.from("bookings").select("confirmation_sms_sent_at").eq("id",bookingId).single();if(!current?.confirmation_sms_sent_at)await sendBookingSms(bookingId,"confirmation");
        }catch(smsError){console.error("Confirmation SMS failed:",smsError);}
      }catch(error){
        await recordPaidRentalFailure({supabase,ledgerId,event,bookingId,businessId,businessSlug,checkoutSessionId:eventSession.id,paymentIntentId,customerId,jobId,error});
        return NextResponse.json({error:"Stripe confirmed payment, but Servonas could not finish the booking job. The event is safe to retry.",code:"paid_booking_fulfillment_failed"},{status:500});
      }
    }
  }

  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.booking_id;
    if (bookingId) {
      await supabase.from("bookings").update({ status: "expired" }).eq("id", bookingId).eq("status", "pending_payment");
      await supabase.from("booking_items").update({ status: "expired" }).eq("booking_id", bookingId).eq("status", "pending_payment");
      if(session.metadata?.business_id)await supabase.from("discount_redemptions").update({status:"voided"}).eq("business_id",session.metadata.business_id).eq("booking_id",bookingId).eq("status","pending");
    }
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (paymentIntentId) {
      const fullyRefunded = charge.refunded;
      const update: Record<string, unknown> = {
        refunded_cents: charge.amount_refunded,
        refunded_at: new Date().toISOString(),
      };
      if (fullyRefunded) update.status = "refunded";
      await supabase.from("bookings").update(update).eq("stripe_payment_intent_id", paymentIntentId);
      if (fullyRefunded) {
        const { data: booking } = await supabase.from("bookings").select("id").eq("stripe_payment_intent_id", paymentIntentId).single();
        if (booking?.id) await supabase.from("booking_items").update({ status: "refunded" }).eq("booking_id", booking.id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
