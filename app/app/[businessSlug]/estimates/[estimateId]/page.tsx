import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import { formatCents } from "@/lib/financial/priceBook";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { convertEstimateToInvoice, convertEstimateToJob, duplicateEstimate, reviseEstimate, sendEstimate, voidEstimate } from "../actions";

export default async function EstimateDetail({ params, searchParams }: { params:Promise<{businessSlug:string;estimateId:string}>; searchParams:Promise<{success?:string;error?:string}> }) {
  const {businessSlug,estimateId}=await params; const q=await searchParams; const {supabase,business,role}=await requireWorkspace(businessSlug);
  const [{data:estimate},{data:lines},{data:fees},{data:events}] = await Promise.all([
    supabase.from("estimates").select("*,customers!estimates_customer_fk(first_name,last_name,company_name,email),service_locations!estimates_location_fk(location_name,street_address,city,state,postal_code),jobs!estimates_job_fk(id,job_number,title)").eq("id",estimateId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle(),
    supabase.from("estimate_line_items").select("*").eq("estimate_id",estimateId).eq("business_id",business.id).order("sort_order"),
    supabase.from("estimate_fees").select("*").eq("estimate_id",estimateId).eq("business_id",business.id).order("sort_order"),
    supabase.from("estimate_events").select("id,event_type,created_at").eq("estimate_id",estimateId).eq("business_id",business.id).order("created_at",{ascending:false}),
  ]);
  if(!estimate) notFound(); const customer=Array.isArray(estimate.customers)?estimate.customers[0]:estimate.customers; const location=Array.isArray(estimate.service_locations)?estimate.service_locations[0]:estimate.service_locations;
  const canEdit=canManageCustomers(role);
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>{estimate.estimate_number} · Version {estimate.version_number}</small><h1>{estimate.title}</h1><p><span className={`estimate-status ${estimate.status}`}>{estimate.status}</span> {customer?.company_name||`${customer?.first_name??""} ${customer?.last_name??""}`}</p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/estimates`}>Back</Link>{canEdit&&estimate.status==="draft"&&<Link className="sv-button" href={`/app/${businessSlug}/estimates/${estimateId}/edit`}>Edit</Link>}</div></header>
    {q.error&&<div className="workspace-notice error">{q.error}</div>}{q.success&&<div className="workspace-notice success">{q.success}</div>}
    {canEdit&&<section className="estimate-actions workspace-panel">
      {estimate.status==="draft"&&<form action={sendEstimate.bind(null,businessSlug,estimateId)}><button className="sv-button">Mark sent</button></form>}
      {["sent","viewed"].includes(estimate.status)&&<form action={reviseEstimate.bind(null,businessSlug,estimateId)}><button className="sv-button sv-secondary">Revise</button></form>}
      <form action={duplicateEstimate.bind(null,businessSlug,estimateId)}><button className="sv-button sv-secondary">Duplicate</button></form>
      {["accepted","sent","viewed"].includes(estimate.status)&&<form action={convertEstimateToJob.bind(null,businessSlug,estimateId)}><button className="sv-button sv-secondary">Convert to job</button></form>}
      {["accepted","converted","sent","viewed"].includes(estimate.status)&&<form action={convertEstimateToInvoice.bind(null,businessSlug,estimateId)}><button className="sv-button sv-secondary">Convert to invoice</button></form>}
      {!["void","converted"].includes(estimate.status)&&<form action={voidEstimate.bind(null,businessSlug,estimateId)}><button className="sv-button sv-danger">Void</button></form>}
    </section>}
    <div className="estimate-detail-grid"><section className="workspace-panel"><h2>Estimate</h2><div className="estimate-document-head"><div><strong>{customer?.company_name||`${customer?.first_name??""} ${customer?.last_name??""}`}</strong><span>{customer?.email}</span>{location&&<span>{location.location_name}: {location.street_address}, {location.city}, {location.state} {location.postal_code}</span>}</div><div><span>Issue: {estimate.issue_date||"Not issued"}</span><span>Expires: {estimate.expiration_date||"No expiration"}</span></div></div>
      <div className="estimate-document-lines"><div className="head"><span>Item</span><span>Qty</span><span>Price</span><span>Total</span></div>{lines?.map(line=><div key={line.id}><span><strong>{line.name_snapshot}</strong><small>{line.description_snapshot}</small></span><span>{line.quantity} {line.unit_type_snapshot}</span><span>{formatCents(line.unit_price_cents,estimate.currency)}</span><span>{formatCents(line.line_total_cents,estimate.currency)}</span></div>)}</div>
      <dl className="estimate-totals"><div><dt>Subtotal</dt><dd>{formatCents(estimate.subtotal_cents,estimate.currency)}</dd></div><div><dt>Discount</dt><dd>−{formatCents(estimate.discount_total_cents,estimate.currency)}</dd></div><div><dt>Tax</dt><dd>{formatCents(estimate.tax_total_cents,estimate.currency)}</dd></div>{fees?.map(fee=><div key={fee.id}><dt>{fee.name_snapshot}</dt><dd>{formatCents(fee.amount_cents,estimate.currency)}</dd></div>)}<div className="total"><dt>Total</dt><dd>{formatCents(estimate.grand_total_cents,estimate.currency)}</dd></div><div><dt>Deposit required</dt><dd>{formatCents(estimate.deposit_required_cents,estimate.currency)}</dd></div></dl>
      {estimate.customer_message&&<div className="estimate-message"><h3>Message</h3><p>{estimate.customer_message}</p></div>}
    </section><aside><section className="workspace-panel"><h2>Internal notes</h2><p>{estimate.internal_notes||"No internal notes."}</p></section><section className="workspace-panel"><h2>Activity</h2><div className="estimate-event-list">{events?.map(event=><div key={event.id}><strong>{event.event_type.replaceAll("_"," ")}</strong><span>{new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:business.timezone}).format(new Date(event.created_at))}</span></div>)}</div></section></aside></div>
  </section></main>;
}
