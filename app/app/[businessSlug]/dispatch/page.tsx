import Link from "next/link";
import { canManageCustomers } from "@/lib/access";
import { addDays, dateInTimeZone, zonedDateTimeToUtc } from "@/lib/bookingTime";
import { conflictingDispatchJobIds, dispatchTechnicianState } from "@/lib/dispatchBoard";
import { availableJobTransitions, type JobStatus } from "@/lib/jobStatusTransitions";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../WorkspaceNav";
import { assignDispatchJob, updateDispatchStatus } from "./actions";

type Relation<T> = T | T[] | null;
type DispatchJob = {
  id: string; job_number: number; title: string; status: JobStatus; priority: string;
  starts_at: string | null; ends_at: string | null; arrival_window_start: string | null; arrival_window_end: string | null;
  assigned_technician_id: string | null; service_address: string | null;
  customers: Relation<{ first_name: string; last_name: string; company_name: string | null; phone: string | null }>;
  service_locations: Relation<{ street_address: string; unit: string | null; city: string; state: string; postal_code: string }>;
  services: Relation<{ name: string }>;
};
type Technician = { id: string; display_name: string; phone: string | null; technician_status: string; schedule_color: string };
const relation = <T,>(value: Relation<T>) => Array.isArray(value) ? value[0] ?? null : value;
const validDate = (value: string | undefined, fallback: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;

function DispatchCard({ job, slug, date, technicians, conflict, canEdit, timeZone }: {
  job: DispatchJob; slug: string; date: string; technicians: Technician[]; conflict: boolean; canEdit: boolean; timeZone: string;
}) {
  const customer = relation(job.customers), location = relation(job.service_locations), service = relation(job.services);
  const time = job.starts_at ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(job.starts_at)) : "Unscheduled";
  const arrival = job.arrival_window_start ? `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(job.arrival_window_start))}–${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(job.arrival_window_end!))}` : null;
  const address = location ? [location.street_address, location.unit, location.city, location.state, location.postal_code].filter(Boolean).join(", ") : job.service_address;
  const late = Boolean(job.starts_at && new Date(job.starts_at).getTime() < Date.now() && !["arrived", "in_progress", "completed", "canceled"].includes(job.status));
  const transitions = availableJobTransitions(job.status);
  return <article className={`dispatch-card priority-${job.priority} ${late ? "late" : ""} ${conflict ? "conflict" : ""}`}>
    <div className="dispatch-card-head"><span>{time}</span><span className={`job-status ${job.status}`}>{job.status.replaceAll("_", " ")}</span></div>
    <Link href={`/app/${slug}/jobs/${job.id}`}><strong>#{job.job_number} · {job.title}</strong></Link>
    <p>{customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "No customer"}</p>
    <small>{service?.name || "Custom work"} · {job.priority} priority</small>
    {arrival && <small>Arrival window: {arrival}</small>}
    {address && <small className="dispatch-address">{address}</small>}
    <div className="dispatch-flags">{late && <b>Late</b>}{conflict && <b>Schedule conflict</b>}</div>
    <div className="dispatch-contact">{customer?.phone && <a href={`tel:${customer.phone}`}>Call customer</a>}{address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">Directions</a>}</div>
    {canEdit && <div className="dispatch-controls"><form action={assignDispatchJob.bind(null, slug, job.id)}><input type="hidden" name="date" value={date}/><label>Assign<select name="technicianId" defaultValue={job.assigned_technician_id ?? ""}><option value="">Unassigned</option>{technicians.map((technician) => <option key={technician.id} value={technician.id} disabled={technician.technician_status === "off_duty"}>{technician.display_name}{technician.technician_status === "off_duty" ? " (off duty)" : ""}</option>)}</select></label><button className="text-button">Save</button></form>{transitions.length > 0 && <form action={updateDispatchStatus.bind(null, slug, job.id)}><input type="hidden" name="date" value={date}/><label>Next status<select name="status" defaultValue={transitions[0]}>{transitions.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><button className="text-button">Update</button></form>}</div>}
  </article>;
}

export default async function DispatchPage({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  const today = dateInTimeZone(new Date(), business.timezone);
  const date = validDate(query.date, today);
  const start = zonedDateTimeToUtc(date, "00:00", business.timezone).toISOString();
  const end = zonedDateTimeToUtc(addDays(date, 1), "00:00", business.timezone).toISOString();
  const [{ data: jobRows, error }, { data: technicianRows }] = await Promise.all([
    supabase.from("jobs").select("id,job_number,title,status,priority,starts_at,ends_at,arrival_window_start,arrival_window_end,assigned_technician_id,service_address,customers(first_name,last_name,company_name,phone),service_locations(street_address,unit,city,state,postal_code),services(name)")
      .eq("business_id", business.id).eq("is_deleted", false).gte("starts_at", start).lt("starts_at", end).not("status", "in", '("canceled","declined")').order("starts_at"),
    supabase.from("technician_profiles").select("id,display_name,phone,technician_status,schedule_color").eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).order("display_name"),
  ]);
  if (error) {
    console.error("Dispatch board query failed", { code: error.code, businessId: business.id });
    throw new Error("The dispatch board could not be loaded.");
  }
  const jobs = (jobRows ?? []) as unknown as DispatchJob[];
  const technicians = (technicianRows ?? []) as Technician[];
  const conflicts = conflictingDispatchJobIds(jobs);
  const unassigned = jobs.filter((job) => !job.assigned_technician_id);
  const canEdit = canManageCustomers(role);
  const hrefFor = (nextDate: string) => `/app/${businessSlug}/dispatch?date=${nextDate}`;
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content dispatch-page">
    <header className="epic3-header"><div><small>Field service operations</small><h1>Dispatch board</h1><p>Coordinate today’s field work in {business.timezone}.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/schedule?date=${date}&view=day`}>Open schedule</Link></header>
    {query.error && <div className="workspace-notice error">{query.error}</div>}{query.success && <div className="workspace-notice success">{query.success}</div>}
    <section className="workspace-panel dispatch-toolbar"><div><Link aria-label="Previous day" href={hrefFor(addDays(date, -1))}>‹</Link><Link className="sv-button sv-secondary" href={hrefFor(today)}>Today</Link><Link aria-label="Next day" href={hrefFor(addDays(date, 1))}>›</Link></div><form><label>Date<input name="date" type="date" defaultValue={date}/></label><button className="sv-button">Go</button></form><strong>{new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00Z`))}</strong></section>
    <div className="dispatch-board">
      <section className="dispatch-column unassigned"><header><div><span className="dispatch-avatar">?</span><div><h2>Unassigned</h2><small>{unassigned.length} jobs</small></div></div></header><div className="dispatch-card-list">{unassigned.length ? unassigned.map((job) => <DispatchCard key={job.id} job={job} slug={businessSlug} date={date} technicians={technicians} conflict={conflicts.has(job.id)} canEdit={canEdit} timeZone={business.timezone}/>) : <div className="dispatch-empty">No unassigned jobs.</div>}</div></section>
      {technicians.map((technician) => {
        const assigned = jobs.filter((job) => job.assigned_technician_id === technician.id);
        const state = dispatchTechnicianState(technician.technician_status, assigned.map((job) => job.status));
        return <section className="dispatch-column" key={technician.id}><header style={{ borderTopColor: technician.schedule_color }}><div><span className="dispatch-avatar" style={{ background: technician.schedule_color }}>{technician.display_name.slice(0, 1)}</span><div><h2>{technician.display_name}</h2><small>{assigned.length} jobs</small></div></div><span className={`technician-state ${state}`}>{state.replaceAll("_", " ")}</span></header><div className="dispatch-card-list">{assigned.length ? assigned.map((job) => <DispatchCard key={job.id} job={job} slug={businessSlug} date={date} technicians={technicians} conflict={conflicts.has(job.id)} canEdit={canEdit} timeZone={business.timezone}/>) : <div className="dispatch-empty">No jobs assigned.</div>}</div></section>;
      })}
    </div>
  </section></main>;
}
