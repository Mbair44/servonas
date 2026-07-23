import Link from "next/link";
import { notFound } from "next/navigation";
import ServiceLocationForm from "@/components/ServiceLocationForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../WorkspaceNav";
import { archiveCustomer, archiveServiceLocation, saveServiceLocation } from "../actions";

export default async function CustomerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string; customerId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessSlug, customerId } = await params;
  const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const [{ data: customer }, { data: locations }, { data: jobs }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle(),
    supabase.from("service_locations").select("*").eq("customer_id", customerId).eq("business_id", business.id).eq("is_deleted", false).order("is_primary", { ascending: false }),
    supabase.from("jobs").select("id,job_number,title,status,starts_at,total_amount").eq("customer_id", customerId).eq("business_id", business.id).eq("is_deleted", false).order("starts_at", { ascending: false, nullsFirst: false }),
  ]);
  if (!customer) notFound();
  const canEdit = canManageCustomers(role);
  const now = Date.now();
  const upcoming = (jobs ?? []).filter((job) => job.starts_at && new Date(job.starts_at).getTime() >= now && job.status !== "canceled");
  const history = (jobs ?? []).filter((job) => !upcoming.some((upcomingJob) => upcomingJob.id === job.id));
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Customer record</small><h1>{customer.first_name} {customer.last_name}</h1><p>{customer.company_name || "Residential customer"}</p></div><div className="crm-header-actions">{customer.phone && <a className="sv-button sv-secondary" href={`tel:${customer.phone}`}>Call</a>}{customer.email && <a className="sv-button sv-secondary" href={`mailto:${customer.email}`}>Email</a>}{canEdit && <Link className="sv-button" href={`/app/${businessSlug}/customers/${customerId}/edit`}>Edit customer</Link>}</div></header>
    {q.error && <div className="workspace-notice error">{q.error}</div>}{q.success && <div className="workspace-notice success">{q.success}</div>}
    <div className="crm-detail-grid">
      <section className="workspace-panel crm-summary"><h2>Contact</h2><dl><div><dt>Email</dt><dd>{customer.email || "Not provided"}</dd></div><div><dt>Primary phone</dt><dd>{customer.phone || "Not provided"}</dd></div><div><dt>Secondary phone</dt><dd>{customer.secondary_phone || "Not provided"}</dd></div><div><dt>Preference</dt><dd>{customer.preferred_contact_method}</dd></div><div><dt>Lead source</dt><dd>{customer.lead_source || "Not recorded"}</dd></div><div><dt>Status</dt><dd>{customer.is_active ? "Active" : "Inactive"}</dd></div></dl>{customer.tags?.length > 0 && <div className="crm-tags">{customer.tags.map((tag: string) => <span key={tag}>{tag}</span>)}</div>}<h3>Notes</h3><p>{customer.notes || "No customer notes."}</p></section>
      <section className="workspace-panel"><div className="panel-title"><h2>Service locations</h2><span>{locations?.length ?? 0}</span></div><div className="crm-location-list">{locations?.map((location) => <article key={location.id}><div><strong>{location.location_name}{location.is_primary ? " · Primary" : ""}</strong><span>{location.street_address}{location.unit ? `, ${location.unit}` : ""}<br/>{location.city}, {location.state} {location.postal_code}</span>{location.access_instructions && <p><b>Access:</b> {location.access_instructions}</p>}</div>{canEdit && <div className="inline-actions"><Link href={`/app/${businessSlug}/customers/${customerId}/locations/${location.id}/edit`}>Edit</Link><form action={archiveServiceLocation.bind(null, businessSlug, customerId, location.id)}><button className="text-button danger">Archive</button></form></div>}</article>)}</div></section>
    </div>
    {canEdit && <section className="workspace-panel"><h2>Add service location</h2><ServiceLocationForm action={saveServiceLocation.bind(null, businessSlug, customerId, null)} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY : undefined}/></section>}
    <div className="crm-detail-grid">
      <section className="workspace-panel"><div className="panel-title"><h2>Upcoming jobs</h2><Link href={`/app/${businessSlug}/jobs?customerId=${customerId}`}>Create job</Link></div>{upcoming.length ? <div className="crm-job-list">{upcoming.map((job) => <Link key={job.id} href={`/app/${businessSlug}/jobs/${job.id}`}><b>#{job.job_number} · {job.title}</b><span>{new Date(job.starts_at).toLocaleString()} · {job.status.replaceAll("_", " ")}</span></Link>)}</div> : <p className="muted">No upcoming jobs.</p>}</section>
      <section className="workspace-panel"><h2>Job history</h2>{history.length ? <div className="crm-job-list">{history.map((job) => <Link key={job.id} href={`/app/${businessSlug}/jobs/${job.id}`}><b>#{job.job_number} · {job.title}</b><span>{job.starts_at ? new Date(job.starts_at).toLocaleDateString() : "Unscheduled"} · ${Number(job.total_amount).toFixed(2)}</span></Link>)}</div> : <p className="muted">No job history.</p>}</section>
    </div>
    <section className="workspace-panel crm-placeholders"><article><h3>Estimates</h3><p>Coming in a future billing checkpoint.</p></article><article><h3>Invoices</h3><p>Coming in a future billing checkpoint.</p></article><article><h3>Communications</h3><p>Provider integrations are not enabled yet.</p></article></section>
    {canEdit && <form action={archiveCustomer.bind(null, businessSlug, customerId)} className="crm-danger-zone"><button className="text-button danger">Archive customer</button></form>}
  </section></main>;
}
