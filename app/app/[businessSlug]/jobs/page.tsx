import Link from "next/link";
import { WorkspaceNav } from "../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageCustomers } from "@/lib/access";
import { jobPriorities, jobStatuses } from "@/lib/jobValidation";

const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
export default async function Jobs({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { businessSlug } = await params;
  const query = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  let jobsQuery = supabase.from("jobs").select("id,job_number,title,status,priority,starts_at,total_amount,customers(first_name,last_name,company_name),service_locations(location_name,city,state),services(name),technician_profiles(display_name)")
    .eq("business_id", business.id).eq("is_deleted", false);
  if (query.status && query.status !== "all") jobsQuery = jobsQuery.eq("status", query.status);
  if (query.priority && query.priority !== "all") jobsQuery = jobsQuery.eq("priority", query.priority);
  if (query.customerId) jobsQuery = jobsQuery.eq("customer_id", query.customerId);
  if (query.technicianId) jobsQuery = jobsQuery.eq("assigned_technician_id", query.technicianId);
  if (query.serviceId) jobsQuery = jobsQuery.eq("service_id", query.serviceId);
  if (query.date) jobsQuery = jobsQuery.gte("starts_at", `${query.date}T00:00:00`).lt("starts_at", `${query.date}T23:59:59.999`);
  if (query.q) {
    const search = query.q.replaceAll(",", "");
    jobsQuery = /^\d+$/.test(search) ? jobsQuery.eq("job_number", Number(search)) : jobsQuery.ilike("title", `%${search}%`);
  }
  jobsQuery = query.sort === "newest" ? jobsQuery.order("created_at", { ascending: false })
    : query.sort === "status" ? jobsQuery.order("status").order("starts_at", { ascending: true, nullsFirst: false })
      : jobsQuery.order("starts_at", { ascending: true, nullsFirst: false });
  const [{ data: jobs, error }, { data: customers }, { data: technicians }, { data: services }] = await Promise.all([
    jobsQuery,
    supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id", business.id).eq("is_deleted", false).order("last_name"),
    supabase.from("technician_profiles").select("id,display_name").eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).order("display_name"),
    supabase.from("services").select("id,name").eq("business_id", business.id).eq("is_deleted", false).order("name"),
  ]);
  if (error) {
    console.error("Job list query failed", { code: error.code, businessId: business.id });
    throw new Error("Jobs could not be loaded.");
  }
  const canEdit = canManageCustomers(role);
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Field service operations</small><h1>Jobs</h1><p>Schedule, assign, and track work from intake through completion.</p></div>{canEdit && <Link className="sv-button" href={`/app/${businessSlug}/jobs/new${query.customerId ? `?customerId=${query.customerId}` : ""}`}>Add job</Link>}</header>
    {query.error && <div className="workspace-notice error">{query.error}</div>}{query.success && <div className="workspace-notice success">{query.success}</div>}
    <section className="workspace-panel"><form className="job-toolbar">
      <label>Search<input name="q" defaultValue={query.q} placeholder="Job title or number"/></label>
      <label>Date<input name="date" type="date" defaultValue={query.date}/></label>
      <label>Status<select name="status" defaultValue={query.status ?? "all"}><option value="all">All statuses</option>{jobStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
      <label>Technician<select name="technicianId" defaultValue={query.technicianId ?? ""}><option value="">All technicians</option>{technicians?.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
      <label>Customer<select name="customerId" defaultValue={query.customerId ?? ""}><option value="">All customers</option>{customers?.map((item) => <option key={item.id} value={item.id}>{item.company_name || `${item.first_name} ${item.last_name}`}</option>)}</select></label>
      <label>Priority<select name="priority" defaultValue={query.priority ?? "all"}><option value="all">All priorities</option>{jobPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
      <label>Service<select name="serviceId" defaultValue={query.serviceId ?? ""}><option value="">All services</option>{services?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Sort<select name="sort" defaultValue={query.sort ?? "scheduled"}><option value="scheduled">Scheduled first</option><option value="newest">Newest first</option><option value="status">Status</option></select></label>
      <button className="sv-button">Apply filters</button><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/jobs`}>Clear</Link>
    </form></section>
    <section className="workspace-panel"><div className="panel-title"><div><span className="sv-kicker">Operations</span><h2>{jobs?.length ?? 0} jobs</h2></div></div>
      <div className="job-list">{jobs?.length ? jobs.map((job) => {
        const customer = relation(job.customers), location = relation(job.service_locations), service = relation(job.services), technician = relation(job.technician_profiles);
        return <article key={job.id}><Link href={`/app/${businessSlug}/jobs/${job.id}`}><div><span className={`job-status ${job.status}`}>{job.status.replaceAll("_", " ")}</span><span className={`job-priority ${job.priority}`}>{job.priority}</span><strong>#{job.job_number} · {job.title}</strong><p>{customer?.company_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "No customer"} · {service?.name || "Custom work"}</p><p>{location ? `${location.location_name}, ${location.city}, ${location.state}` : "No saved location"} · {technician?.display_name || "Unassigned"}</p><p>{job.starts_at ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: business.timezone }).format(new Date(job.starts_at)) : "Unscheduled"}</p></div><b>${Number(job.total_amount ?? 0).toFixed(2)}</b></Link></article>;
      }) : <div className="sv-empty"><h3>No matching jobs</h3><p>Adjust the filters or create a new job.</p></div>}</div>
    </section>
  </section></main>;
}
