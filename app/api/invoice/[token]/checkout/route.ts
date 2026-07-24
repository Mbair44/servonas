import { NextResponse } from "next/server";
import { invoicePaymentAmount,InvoicePaymentAmountError,type InvoicePaymentPurpose } from "@/lib/invoicePayment";
import { publicDocumentTokenHash,validPublicDocumentToken } from "@/lib/publicDocumentToken";
import { allowPublicInvoiceAccess } from "@/lib/publicInvoiceRateLimit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { stripeClient,stripeConnectBaseUrl,stripePaymentsReady,stripeProviderError } from "@/lib/stripeConnect";

export const runtime="nodejs";

function portal(base:string,token:string,state:string){
  return new URL(`/invoice/${encodeURIComponent(token)}?payment=${state}`,base);
}

export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  let base:string;
  try{base=stripeConnectBaseUrl();}
  catch(error){console.error("Invoice Checkout URL configuration failed",{message:error instanceof Error?error.message:"Unknown error"});return NextResponse.json({error:"Online payment is unavailable."},{status:503});}
  if(!validPublicDocumentToken(token))return NextResponse.redirect(portal(base,token,"invalid"),303);
  const supabase=getSupabaseAdmin();
  if(!supabase)return NextResponse.redirect(portal(base,token,"failed"),303);
  const hash=await publicDocumentTokenHash(token);
  const {data:invoice,error:invoiceError}=await supabase.from("invoices").select(
    "id,business_id,customer_id,job_id,invoice_number,currency,status,grand_total_cents,amount_paid_cents,amount_refunded_cents,balance_due_cents,deposit_required_cents,allow_partial_payments,minimum_partial_payment_cents,public_token_revoked_at,public_token_expires_at,customers!invoices_customer_fk(email)"
  ).eq("public_token_hash",hash).eq("is_deleted",false).maybeSingle();
  if(invoiceError){
    console.error("Invoice Checkout lookup failed",{code:invoiceError.code});
    return NextResponse.redirect(portal(base,token,"failed"),303);
  }
  if(!invoice||invoice.public_token_revoked_at||(invoice.public_token_expires_at&&new Date(invoice.public_token_expires_at)<=new Date())||["draft","void","paid","refunded"].includes(invoice.status)){
    return NextResponse.redirect(portal(base,token,"invalid"),303);
  }
  if(!await allowPublicInvoiceAccess(supabase,new Headers(request.headers),{id:invoice.id,business_id:invoice.business_id})){
    return NextResponse.redirect(portal(base,token,"limited"),303);
  }
  const customer=Array.isArray(invoice.customers)?invoice.customers[0]:invoice.customers;
  if(!customer?.email)return NextResponse.redirect(portal(base,token,"email-required"),303);
  const form=await request.formData();
  const purpose=String(form.get("purpose")||"") as InvoicePaymentPurpose;
  const requestKey=String(form.get("requestKey")||"");
  if(!["balance","deposit","partial"].includes(purpose)||!requestKey.match(/^[0-9a-f-]{36}$/i)){
    return NextResponse.redirect(portal(base,token,"invalid"),303);
  }
  const partialRaw=String(form.get("partialAmount")||"");
  const partialCents=partialRaw&&/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(partialRaw)?Math.round(Number(partialRaw)*100):null;
  let amount:number;
  try{
    amount=invoicePaymentAmount({
      purpose,balanceDueCents:Number(invoice.balance_due_cents),depositRequiredCents:Number(invoice.deposit_required_cents),
      netPaidCents:Number(invoice.amount_paid_cents)-Number(invoice.amount_refunded_cents),
      allowPartialPayments:Boolean(invoice.allow_partial_payments),minimumPartialPaymentCents:Number(invoice.minimum_partial_payment_cents),
      requestedPartialCents:partialCents,
    });
  }catch(error){
    const state=error instanceof InvoicePaymentAmountError?"amount-invalid":"failed";
    return NextResponse.redirect(portal(base,token,state),303);
  }
  const {data:account,error:accountError}=await supabase.from("business_payment_accounts").select("provider_account_id,onboarding_status,charges_enabled,payouts_enabled")
    .eq("business_id",invoice.business_id).eq("provider","stripe").maybeSingle();
  if(accountError||!account?.provider_account_id||!stripePaymentsReady(account)){
    if(accountError)console.error("Invoice Checkout payment-account lookup failed",{invoiceId:invoice.id,code:accountError.code});
    return NextResponse.redirect(portal(base,token,"unavailable"),303);
  }
  const {data:existing,error:existingError}=await supabase.from("payments").select("id,provider_checkout_session_id,provider_account_id")
    .eq("business_id",invoice.business_id).eq("idempotency_key",requestKey).maybeSingle();
  if(existingError){
    console.error("Invoice Checkout idempotency lookup failed",{invoiceId:invoice.id,code:existingError.code});
    return NextResponse.redirect(portal(base,token,"failed"),303);
  }
  const stripe=stripeClient();
  if(existing?.provider_checkout_session_id){
    try{
      const session=await stripe.checkout.sessions.retrieve(existing.provider_checkout_session_id,{}, {stripeAccount:existing.provider_account_id});
      if(session.url)return NextResponse.redirect(session.url,303);
    }catch(error){console.error("Invoice Checkout replay retrieval failed",{invoiceId:invoice.id,paymentId:existing.id,...stripeProviderError(error)});}
    return NextResponse.redirect(portal(base,token,"submitted"),303);
  }
  const paymentId=existing?.id??crypto.randomUUID();
  if(!existing){
    const {error:insertError}=await supabase.from("payments").insert({
      id:paymentId,business_id:invoice.business_id,customer_id:invoice.customer_id,invoice_id:invoice.id,job_id:invoice.job_id,
      provider:"stripe",provider_account_id:account.provider_account_id,idempotency_key:requestKey,payment_purpose:purpose,
      amount_cents:amount,currency:String(invoice.currency).toUpperCase(),status:"pending",net_amount_cents:0,
    });
    if(insertError){
      console.error("Invoice Checkout payment ledger insert failed",{invoiceId:invoice.id,code:insertError.code});
      return NextResponse.redirect(portal(base,token,"failed"),303);
    }
  }
  try{
    const session=await stripe.checkout.sessions.create({
      mode:"payment",
      customer_email:customer.email,
      client_reference_id:paymentId,
      line_items:[{quantity:1,price_data:{
        currency:String(invoice.currency).toLowerCase(),unit_amount:amount,
        product_data:{name:`Payment for invoice ${invoice.invoice_number}`,description:purpose==="deposit"?"Required deposit":purpose==="partial"?"Partial payment":"Invoice balance"},
      }}],
      success_url:portal(base,token,"submitted").toString(),
      cancel_url:portal(base,token,"cancelled").toString(),
      metadata:{servonas_kind:"invoice_payment",payment_id:paymentId,invoice_id:invoice.id},
      payment_intent_data:{receipt_email:customer.email,metadata:{servonas_kind:"invoice_payment",payment_id:paymentId,invoice_id:invoice.id}},
    },{stripeAccount:account.provider_account_id,idempotencyKey:`servonas-invoice-${invoice.business_id}-${requestKey}`});
    const intentId=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id??null;
    const {error:updateError}=await supabase.from("payments").update({
      provider_checkout_session_id:session.id,provider_payment_intent_id:intentId,
    }).eq("id",paymentId).eq("business_id",invoice.business_id);
    if(updateError)throw new Error(`Payment session ledger update failed (${updateError.code}).`);
    await supabase.from("invoice_events").insert({
      business_id:invoice.business_id,invoice_id:invoice.id,event_type:"payment_initiated",
      metadata:{payment_id:paymentId,amount_cents:amount,purpose,provider:"stripe"},
    });
    if(!session.url)throw new Error("Stripe Checkout did not return a hosted URL.");
    return NextResponse.redirect(session.url,303);
  }catch(error){
    const detail=stripeProviderError(error);
    console.error("Invoice Checkout creation failed",{invoiceId:invoice.id,paymentId,...detail});
    await supabase.from("payments").update({
      status:"failed",failure_code:detail.code??detail.type,failure_message:detail.message.slice(0,1000),failed_at:new Date().toISOString(),
    }).eq("id",paymentId).eq("business_id",invoice.business_id).neq("status","succeeded");
    return NextResponse.redirect(portal(base,token,"failed"),303);
  }
}
