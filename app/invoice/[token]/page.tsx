import { headers } from "next/headers";
import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import InvoicePaymentForm from "@/components/InvoicePaymentForm";
import { formatBusinessDateTime } from "@/lib/bookingTime";
import { formatCents } from "@/lib/financial/priceBook";
import { publicDocumentTokenHash,validPublicDocumentToken } from "@/lib/publicDocumentToken";
import { allowPublicInvoiceAccess } from "@/lib/publicInvoiceRateLimit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { stripePaymentsReady } from "@/lib/stripeConnect";
import { sendInvoiceFinancialEmail } from "@/lib/communications/invoiceEmailService";

export const dynamic="force-dynamic";
export const metadata={
  robots:{index:false,follow:false},
  referrer:"no-referrer" as const,
};

export default async function PublicInvoice({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{payment?:string}>}){
  const {token}=await params;
  const {payment:paymentState}=await searchParams;
  if(!validPublicDocumentToken(token))notFound();
  const supabase=getSupabaseAdmin();
  if(!supabase)throw new Error("Public invoice service is unavailable.");
  const tokenHash=await publicDocumentTokenHash(token);
  const {data:invoice,error}=await supabase.from("invoices").select(
    "*,businesses(name,timezone),customers!invoices_customer_fk(first_name,last_name,company_name,email),service_locations!invoices_location_fk(location_name,street_address,city,state,postal_code),jobs!invoices_job_fk(id,job_number,title,starts_at,status)"
  ).eq("public_token_hash",tokenHash).eq("is_deleted",false).maybeSingle();
  if(error){
    console.error("Public invoice lookup failed",{code:error.code});
    throw new Error("The invoice could not be loaded.");
  }
  if(!invoice||invoice.public_token_revoked_at||(invoice.public_token_expires_at&&new Date(invoice.public_token_expires_at)<=new Date()))notFound();
  if(!await allowPublicInvoiceAccess(supabase,await headers(),{id:invoice.id,business_id:invoice.business_id})){
    console.warn("Public invoice access limited",{invoiceId:invoice.id});
    notFound();
  }
  const business=Array.isArray(invoice.businesses)?invoice.businesses[0]:invoice.businesses;
  const customer=Array.isArray(invoice.customers)?invoice.customers[0]:invoice.customers;
  const location=Array.isArray(invoice.service_locations)?invoice.service_locations[0]:invoice.service_locations;
  const job=Array.isArray(invoice.jobs)?invoice.jobs[0]:invoice.jobs;
  const [{data:lines,error:linesError},{data:fees,error:feesError},{data:payments,error:paymentsError},{data:settings},{data:paymentAccount}]=await Promise.all([
    supabase.from("invoice_line_items").select("id,name_snapshot,description_snapshot,quantity,unit_type_snapshot,unit_price_cents,line_total_cents").eq("invoice_id",invoice.id).eq("business_id",invoice.business_id).order("sort_order"),
    supabase.from("invoice_fees").select("id,name_snapshot,amount_cents").eq("invoice_id",invoice.id).eq("business_id",invoice.business_id).order("sort_order"),
    supabase.from("payments").select("id,amount_cents,currency,payment_method_type,provider,status,paid_at,received_at,created_at,offline_reference,provider_receipt_url").eq("invoice_id",invoice.id).eq("business_id",invoice.business_id).in("status",["succeeded","partially_refunded","refunded"]).order("created_at",{ascending:false}),
    supabase.from("booking_settings").select("brand_color,logo_path,logo_url").eq("business_id",invoice.business_id).maybeSingle(),
    supabase.from("business_payment_accounts").select("charges_enabled,payouts_enabled,onboarding_status").eq("business_id",invoice.business_id).eq("provider","stripe").maybeSingle(),
  ]);
  if(linesError||feesError||paymentsError){
    console.error("Public invoice detail lookup failed",{linesCode:linesError?.code,feesCode:feesError?.code,paymentsCode:paymentsError?.code,invoiceId:invoice.id});
    throw new Error("Invoice details could not be loaded.");
  }
  if(invoice.status==="sent"){
    const {data:transition,error:transitionError}=await supabase.from("invoices").update({
      status:"viewed",viewed_at:invoice.viewed_at||new Date().toISOString(),
    }).eq("id",invoice.id).eq("business_id",invoice.business_id).eq("status","sent").select("id").maybeSingle();
    if(transitionError)console.error("Public invoice viewed transition failed",{code:transitionError.code,invoiceId:invoice.id});
    if(transition)await supabase.from("invoice_events").insert({business_id:invoice.business_id,invoice_id:invoice.id,event_type:"viewed"});
    if(transition)await sendInvoiceFinancialEmail(invoice.id,"invoice_viewed");
  }
  const {error:accessEventError}=await supabase.from("invoice_events").insert({business_id:invoice.business_id,invoice_id:invoice.id,event_type:"public_link_accessed"});
  if(accessEventError)console.error("Public invoice access event failed",{code:accessEventError.code,invoiceId:invoice.id});
  const {data:signedLogo}=settings?.logo_path?await supabase.storage.from("booking-branding").createSignedUrl(settings.logo_path,3600):{data:null};
  const logo=signedLogo?.signedUrl??settings?.logo_url??null;
  const onlineReady=stripePaymentsReady(paymentAccount??{});
  const netPaid=Math.max(0,Number(invoice.amount_paid_cents)-Number(invoice.amount_refunded_cents));
  const depositRemaining=Math.min(Number(invoice.balance_due_cents),Math.max(0,Number(invoice.deposit_required_cents)-netPaid));
  const timeZone=business?.timezone||"UTC";
  return <main className="public-estimate public-invoice" style={{"--estimate-brand":settings?.brand_color||"#4f46e5"} as React.CSSProperties}>
    <article className="public-estimate-document" aria-labelledby="invoice-title">
      <header><div>{logo?<img src={logo} alt={`${business?.name||"Business"} logo`}/>:<span className="public-estimate-mark">{business?.name?.slice(0,1)||"S"}</span>}<div><strong>{business?.name}</strong><small>Invoice {invoice.invoice_number}</small></div></div><PrintButton/></header>
      <div className="public-estimate-title"><span className={`estimate-status ${invoice.status}`}>{invoice.status.replaceAll("_"," ")}</span><h1 id="invoice-title">{invoice.title}</h1><p>{invoice.customer_notes||"Invoice details and payment history are shown below."}</p></div>
      <section className="public-estimate-parties" aria-label="Invoice parties and dates"><div><span>Bill to</span><strong>{customer?.company_name||`${customer?.first_name??""} ${customer?.last_name??""}`}</strong><small>{customer?.email}</small>{location&&<small>{location.location_name} · {location.street_address}, {location.city}, {location.state} {location.postal_code}</small>}</div><div><span>Invoice details</span><strong>{invoice.invoice_number}</strong><small>Issued {invoice.issue_date||"Not specified"}</small><small>Due {invoice.due_date||"Upon receipt"}</small></div></section>
      {job&&<section className="public-invoice-job"><div><span>Related service job</span><strong>#{job.job_number} · {job.title}</strong></div><div><span>Status</span><strong>{job.status.replaceAll("_"," ")}</strong>{job.starts_at&&<small>{formatBusinessDateTime(job.starts_at,timeZone)}</small>}</div></section>}
      <section className="public-estimate-lines" aria-label="Invoice line items"><div className="head"><span>Description</span><span>Quantity</span><span>Unit price</span><span>Total</span></div>{(lines??[]).map(line=><div key={line.id}><span><strong>{line.name_snapshot}</strong>{line.description_snapshot&&<small>{line.description_snapshot}</small>}</span><span>{line.quantity} {line.unit_type_snapshot.replaceAll("_"," ")}</span><span>{formatCents(line.unit_price_cents,invoice.currency)}</span><span>{formatCents(line.line_total_cents,invoice.currency)}</span></div>)}</section>
      <dl className="public-estimate-totals"><div><dt>Subtotal</dt><dd>{formatCents(invoice.subtotal_cents,invoice.currency)}</dd></div>{invoice.discount_total_cents>0&&<div><dt>Discount</dt><dd>−{formatCents(invoice.discount_total_cents,invoice.currency)}</dd></div>}<div><dt>Tax</dt><dd>{formatCents(invoice.tax_total_cents,invoice.currency)}</dd></div>{(fees??[]).map(fee=><div key={fee.id}><dt>{fee.name_snapshot}</dt><dd>{formatCents(fee.amount_cents,invoice.currency)}</dd></div>)}<div><dt>Total</dt><dd>{formatCents(invoice.grand_total_cents,invoice.currency)}</dd></div><div><dt>Amount paid</dt><dd>−{formatCents(invoice.amount_paid_cents-invoice.amount_refunded_cents,invoice.currency)}</dd></div><div className="total"><dt>Balance due</dt><dd>{formatCents(invoice.balance_due_cents,invoice.currency)}</dd></div></dl>
      {paymentState&&<div className={`public-payment-notice ${["failed","invalid","amount-invalid","email-required","unavailable","limited"].includes(paymentState)?"error":""}`} role="status">{
        paymentState==="submitted"?"Payment submitted. This page will show it after Stripe verifies the payment.":
        paymentState==="cancelled"?"Payment was cancelled. No invoice payment was recorded.":
        paymentState==="amount-invalid"?"That payment amount is not valid for this invoice.":
        paymentState==="email-required"?"The business must add an email address to your customer record before online payment can be used.":
        paymentState==="unavailable"?"Online payment is temporarily unavailable. Please contact the business.":
        paymentState==="limited"?"Too many requests were received. Please wait and try again.":
        paymentState==="invalid"?"This invoice cannot currently accept a payment.":
        "Payment could not be started. Please try again or contact the business."
      }</div>}
      {invoice.balance_due_cents>0&&!["void","refunded"].includes(invoice.status)&&<section className="public-invoice-payment"><h2>Payment</h2>{onlineReady?<InvoicePaymentForm token={token} balanceDueCents={Number(invoice.balance_due_cents)} depositRemainingCents={depositRemaining} allowPartialPayments={Boolean(invoice.allow_partial_payments)} minimumPartialPaymentCents={Number(invoice.minimum_partial_payment_cents)} currency={invoice.currency}/>:<><strong>Online payment is not currently available.</strong><p>Contact {business?.name} to arrange payment.</p></>}</section>}
      <section className="public-invoice-history" aria-labelledby="payment-history-heading"><h2 id="payment-history-heading">Payment history and receipts</h2>{payments?.length?<div>{payments.map(payment=><article key={payment.id}><div><strong>{formatCents(payment.amount_cents,payment.currency)}</strong><span>{(payment.payment_method_type||payment.provider).replaceAll("_"," ")}</span></div><div><strong>Payment received</strong><span>{formatBusinessDateTime(payment.paid_at||payment.received_at||payment.created_at,timeZone)}</span>{payment.offline_reference&&<small>Reference: {payment.offline_reference}</small>}{payment.provider_receipt_url&&<a href={payment.provider_receipt_url} target="_blank" rel="noreferrer">View Stripe receipt</a>}</div></article>)}</div>:<p>No payments have been recorded for this invoice.</p>}</section>
      {invoice.status==="void"&&<section className="public-estimate-closed"><strong>This invoice is void.</strong><p>No payment is due.</p></section>}
      <footer>Powered by Servonas · Secure invoice access</footer>
    </article>
  </main>;
}
