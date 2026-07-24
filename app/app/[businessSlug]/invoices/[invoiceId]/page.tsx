import Link from "next/link";
import { notFound } from "next/navigation";
import OfflinePaymentForm from "@/components/OfflinePaymentForm";
import PrintButton from "@/components/PrintButton";
import { canManageCustomers } from "@/lib/access";
import { formatCents } from "@/lib/financial/priceBook";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { duplicateInvoice,recordOfflinePayment,resendInvoice,sendInvoice,voidInvoice } from "../actions";

export default async function InvoiceDetail({params,searchParams}:{params:Promise<{businessSlug:string;invoiceId:string}>;searchParams:Promise<{success?:string;error?:string}>}){
  const {businessSlug,invoiceId}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
  const [{data:invoice},{data:lines},{data:fees},{data:payments},{data:events}]=await Promise.all([
    supabase.from("invoices").select("*,customers!invoices_customer_fk(first_name,last_name,company_name,email),service_locations!invoices_location_fk(location_name,street_address,city,state,postal_code),jobs!invoices_job_fk(id,job_number,title),estimates!invoices_estimate_fk(id,estimate_number)").eq("id",invoiceId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle(),
    supabase.from("invoice_line_items").select("*").eq("invoice_id",invoiceId).eq("business_id",business.id).order("sort_order"),
    supabase.from("invoice_fees").select("*").eq("invoice_id",invoiceId).eq("business_id",business.id).order("sort_order"),
    supabase.from("payments").select("id,amount_cents,currency,payment_method_type,provider,status,received_at,offline_reference,created_at").eq("invoice_id",invoiceId).eq("business_id",business.id).order("created_at",{ascending:false}),
    supabase.from("invoice_events").select("id,event_type,metadata,created_at").eq("invoice_id",invoiceId).eq("business_id",business.id).order("created_at",{ascending:false}),
  ]);
  if(!invoice)notFound();
  const customer=Array.isArray(invoice.customers)?invoice.customers[0]:invoice.customers;
  const location=Array.isArray(invoice.service_locations)?invoice.service_locations[0]:invoice.service_locations;
  const job=Array.isArray(invoice.jobs)?invoice.jobs[0]:invoice.jobs;
  const estimate=Array.isArray(invoice.estimates)?invoice.estimates[0]:invoice.estimates;
  const canEdit=canManageCustomers(role),canPay=canEdit&&invoice.balance_due_cents>0&&!["draft","void","refunded"].includes(invoice.status);
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>{invoice.invoice_number}</small><h1>{invoice.title}</h1><p><span className={`estimate-status ${invoice.status}`}>{invoice.status.replaceAll("_"," ")}</span> {customer?.company_name||`${customer?.first_name??""} ${customer?.last_name??""}`}</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/invoices`}>Back</Link>{canEdit&&invoice.status==="draft"&&<Link className="sv-button" href={`/app/${businessSlug}/invoices/${invoiceId}/edit`}>Edit</Link>}<PrintButton/></div></header>
    {q.error&&<div className="workspace-notice error">{q.error}</div>}{q.success&&<div className="workspace-notice success">{q.success}</div>}
    {canEdit&&<section className="estimate-actions workspace-panel">
      {invoice.status==="draft"&&<form action={sendInvoice.bind(null,businessSlug,invoiceId)}><button className="sv-button">Send</button></form>}
      {["sent","viewed","partially_paid","overdue"].includes(invoice.status)&&<form action={resendInvoice.bind(null,businessSlug,invoiceId)}><button className="sv-button sv-secondary">Resend</button></form>}
      <form action={duplicateInvoice.bind(null,businessSlug,invoiceId)}><button className="sv-button sv-secondary">Duplicate</button></form>
      {!["void","paid","refunded"].includes(invoice.status)&&<form action={voidInvoice.bind(null,businessSlug,invoiceId)}><input required name="reason" maxLength={500} placeholder="Void reason"/><button className="sv-button sv-danger">Void</button></form>}
    </section>}
    <div className="estimate-detail-grid"><section className="workspace-panel"><h2>Invoice</h2><div className="estimate-document-head"><div><strong>{customer?.company_name||`${customer?.first_name??""} ${customer?.last_name??""}`}</strong><span>{customer?.email}</span>{location&&<span>{location.location_name}: {location.street_address}, {location.city}, {location.state} {location.postal_code}</span>}</div><div><span>Issued: {invoice.issue_date||"Not issued"}</span><span>Due: {invoice.due_date||"No due date"}</span>{estimate&&<Link href={`/app/${businessSlug}/estimates/${estimate.id}`}>From estimate {estimate.estimate_number}</Link>}{job&&<Link href={`/app/${businessSlug}/jobs/${job.id}`}>From job #{job.job_number}</Link>}</div></div>
      <div className="estimate-document-lines"><div className="head"><span>Item</span><span>Qty</span><span>Price</span><span>Total</span></div>{lines?.map(line=><div key={line.id}><span><strong>{line.name_snapshot}</strong><small>{line.description_snapshot}</small></span><span>{line.quantity} {line.unit_type_snapshot}</span><span>{formatCents(line.unit_price_cents,invoice.currency)}</span><span>{formatCents(line.line_total_cents,invoice.currency)}</span></div>)}</div>
      <dl className="estimate-totals"><div><dt>Subtotal</dt><dd>{formatCents(invoice.subtotal_cents,invoice.currency)}</dd></div><div><dt>Discount</dt><dd>−{formatCents(invoice.discount_total_cents,invoice.currency)}</dd></div><div><dt>Tax</dt><dd>{formatCents(invoice.tax_total_cents,invoice.currency)}</dd></div>{fees?.map(fee=><div key={fee.id}><dt>{fee.name_snapshot}</dt><dd>{formatCents(fee.amount_cents,invoice.currency)}</dd></div>)}<div className="total"><dt>Total</dt><dd>{formatCents(invoice.grand_total_cents,invoice.currency)}</dd></div><div><dt>Paid</dt><dd>{formatCents(invoice.amount_paid_cents-invoice.amount_refunded_cents,invoice.currency)}</dd></div><div className="total"><dt>Balance due</dt><dd>{formatCents(invoice.balance_due_cents,invoice.currency)}</dd></div></dl>
      {invoice.customer_notes&&<div className="estimate-message"><h3>Customer note</h3><p>{invoice.customer_notes}</p></div>}
    </section><aside>
      {canPay&&<section className="workspace-panel"><h2>Record offline payment</h2><p>Use “Other / deposit application” when applying funds collected outside Servonas.</p><OfflinePaymentForm action={recordOfflinePayment.bind(null,businessSlug,invoiceId)} balance={(invoice.balance_due_cents/100).toFixed(2)}/></section>}
      <section className="workspace-panel"><h2>Payment history</h2><div className="estimate-event-list">{payments?.length?payments.map(payment=><div key={payment.id}><strong>{formatCents(payment.amount_cents,payment.currency)} · {(payment.payment_method_type||payment.provider).replaceAll("_"," ")}</strong><span>{payment.status} · {new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:business.timezone}).format(new Date(payment.received_at||payment.created_at))}</span>{payment.offline_reference&&<small>{payment.offline_reference}</small>}</div>):<p>No payments recorded.</p>}</div></section>
      <section className="workspace-panel"><h2>Internal notes</h2><p>{invoice.internal_notes||"No internal notes."}</p></section>
      <section className="workspace-panel"><h2>Activity</h2><div className="estimate-event-list">{events?.map(event=><div key={event.id}><strong>{event.event_type.replaceAll("_"," ")}</strong><span>{new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:business.timezone}).format(new Date(event.created_at))}</span></div>)}</div></section>
    </aside></div>
  </section></main>;
}
