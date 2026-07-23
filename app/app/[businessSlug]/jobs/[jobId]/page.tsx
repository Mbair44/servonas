import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceNav } from "../../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageCustomers } from "@/lib/access";
import { addJobNote, addJobPhoto, archiveJob, cancelJob, changeJobStatus } from "../actions";
import { jobStatuses } from "@/lib/jobValidation";

const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const money = (value: number | null) => `$${Number(value ?? 0).toFixed(2)}`;
export default async function JobDetail({ params, searchParams }: { params: Promise<{ businessSlug: string; jobId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { businessSlug, jobId } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const [{ data: job, error }, { data: history }, { data: photoRows }] = await Promise.all([
    supabase.from("jobs").select("*,customers(id,first_name,last_name,company_name,email,phone),service_locations(id,location_name,street_address,unit,city,state,postal_code),services(name),technician_profiles(display_name)").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle(),
    supabase.from("job_status_history").select("id,from_status,to_status,changed_at,change_reason").eq("job_id", jobId).eq("business_id", business.id).order("changed_at", { ascending: false }),
    supabase.from("job_photos").select("id,storage_path,caption,created_at").eq("job_id", jobId).eq("business_id", business.id).order("created_at", { ascending: false }),
  ]);
  if (error) console.error("Job detail query failed", { code: error.code, businessId: business.id, jobId });
  if (!job) notFound();
  const customer = relation(job.customers), location = relation(job.service_locations), service = relation(job.services), technician = relation(job.technician_profiles);
  const canEdit = canManageCustomers(role);
  const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: business.timezone }).format(new Date(value)) : "Not set";
  const photos = await Promise.all((photoRows ?? []).map(async (photo) => {
    const { data } = await supabase.storage.from("job-photos").createSignedUrl(photo.storage_path, 3600);
    return { ...photo, url: data?.signedUrl ?? null };
  }));
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Job #{job.job_number}</small><h1>{job.title}</h1><p><span className={`job-status ${job.status}`}>{job.status.replaceAll("_", " ")}</span> <span className={`job-priority ${job.priority}`}>{job.priority} priority</span></p></div><div className="crm-header-actions"><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/jobs`}>Back to jobs</Link>{canEdit && <Link className="sv-button" href={`/app/${businessSlug}/jobs/${jobId}/edit`}>Edit job</Link>}</div></header>
    {query.error && <div className="workspace-notice error">{query.error}</div>}{query.success && <div className="workspace-notice success">{query.success}</div>}
    <div className="job-detail-grid">
      <section className="workspace-panel job-summary"><h2>Customer & location</h2><dl>
        <div><dt>Customer</dt><dd>{customer ? <Link href={`/app/${businessSlug}/customers/${customer.id}`}>{customer.company_name || `${customer.first_name} ${customer.last_name}`}</Link> : "Not assigned"}</dd></div>
        <div><dt>Phone</dt><dd>{customer?.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : "Not set"}</dd></div><div><dt>Email</dt><dd>{customer?.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : "Not set"}</dd></div>
        <div><dt>Location</dt><dd>{location ? <>{location.location_name}<br/><span>{[location.street_address, location.unit, location.city, location.state, location.postal_code].filter(Boolean).join(", ")}</span></> : job.service_address || "Not set"}</dd></div>
      </dl><h2>Work</h2><dl><div><dt>Service</dt><dd>{service?.name || "Custom work"}</dd></div><div><dt>Technician</dt><dd>{technician?.display_name || "Unassigned"}</dd></div><div><dt>Description</dt><dd>{job.description || "No description"}</dd></div><div><dt>Customer notes</dt><dd>{job.customer_notes || "None"}</dd></div><div><dt>Internal notes</dt><dd>{job.internal_notes || "None"}</dd></div></dl>
      </section>
      <section className="workspace-panel job-summary"><h2>Schedule</h2><dl><div><dt>Start</dt><dd>{dateTime(job.starts_at)}</dd></div><div><dt>End</dt><dd>{dateTime(job.ends_at)}</dd></div><div><dt>Arrival window</dt><dd>{job.arrival_window_start ? `${dateTime(job.arrival_window_start)} – ${dateTime(job.arrival_window_end)}` : "Not set"}</dd></div><div><dt>Duration</dt><dd>{job.estimated_duration_minutes ? `${job.estimated_duration_minutes} minutes` : "Not set"}</dd></div></dl>
        <h2>Price & payment</h2><dl><div><dt>Subtotal</dt><dd>{money(job.subtotal)}</dd></div><div><dt>Tax</dt><dd>{money(job.tax_amount)}</dd></div><div><dt>Discount</dt><dd>−{money(job.discount_amount)}</dd></div><div><dt>Total</dt><dd><strong>{money(job.total_amount)}</strong></dd></div><div><dt>Payment</dt><dd>{job.payment_status.replaceAll("_", " ")}</dd></div><div><dt>Source</dt><dd>{job.booking_source || "Unknown"}</dd></div></dl>
      </section>
    </div>
    {canEdit && <section className="workspace-panel job-actions"><div><span className="sv-kicker">Office controls</span><h2>Job actions</h2></div><form action={changeJobStatus.bind(null, businessSlug, jobId)}><label>Status<select name="status" defaultValue={job.status}>{jobStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><button className="sv-button">Update status</button></form><form action={cancelJob.bind(null, businessSlug, jobId)}><label>Cancellation reason<input name="cancellationReason" placeholder="Reason for cancellation"/></label><button className="sv-button sv-danger">Cancel job</button></form><form action={archiveJob.bind(null, businessSlug, jobId)}><button className="text-button">Archive job</button></form><form className="job-note-action" action={addJobNote.bind(null, businessSlug, jobId)}><label>Add internal note<textarea required name="note" rows={2} placeholder="Add an office note…"/></label><button className="sv-button sv-secondary">Add note</button></form></section>}
    <section className="workspace-panel"><h2>Status timeline</h2><div className="activity-list">{history?.length ? history.map((item) => <article key={item.id}><div><strong>{item.from_status ? `${item.from_status.replaceAll("_", " ")} → ` : ""}{item.to_status.replaceAll("_", " ")}</strong>{item.change_reason && <p>{item.change_reason}</p>}</div><span>{dateTime(item.changed_at)}</span></article>) : <p>No status changes recorded yet.</p>}</div><div className="job-photo-placeholder"><div className="panel-title"><div><strong>Job photos</strong><p>Private job documentation. Links expire after one hour.</p></div>{canEdit && <form action={addJobPhoto.bind(null, businessSlug, jobId)}><input required name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic"/><input name="caption" placeholder="Optional caption"/><button className="sv-button sv-secondary">Upload photo</button></form>}</div>{photos.length ? <div className="job-photo-grid">{photos.map((photo) => photo.url && <figure key={photo.id}><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.caption || "Job photo"}/></a>{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div> : <p>No photos uploaded.</p>}</div></section>
  </section></main>;
}
