import Link from "next/link";
import { notFound } from "next/navigation";
import JobForm from "@/components/JobForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../../WorkspaceNav";
import { updateJob } from "../../actions";

function localInput(value: string | null, timeZone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export default async function EditJob({ params }: { params: Promise<{ businessSlug: string; jobId: string }> }) {
  const { businessSlug, jobId } = await params;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!canManageCustomers(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><div className="workspace-notice error">You do not have permission to edit jobs.</div></section></main>;
  const [{ data: job }, { data: customers }, { data: locations }, { data: services }, { data: technicians }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle(),
    supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id", business.id).eq("is_deleted", false).order("last_name"),
    supabase.from("service_locations").select("id,customer_id,location_name,street_address,city,state").eq("business_id", business.id).eq("is_deleted", false).order("location_name"),
    supabase.from("services").select("id,name,duration_minutes").eq("business_id", business.id).eq("is_deleted", false).order("name"),
    supabase.from("technician_profiles").select("id,display_name").eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true).order("display_name"),
  ]);
  if (!job) notFound();
  const formJob = {
    ...job,
    starts_at_local: localInput(job.starts_at, business.timezone),
    ends_at_local: localInput(job.ends_at, business.timezone),
    arrival_window_start_local: localInput(job.arrival_window_start, business.timezone),
    arrival_window_end_local: localInput(job.arrival_window_end, business.timezone),
  };
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Job #{job.job_number}</small><h1>Edit {job.title}</h1><p>All scheduling times are shown in {business.timezone}.</p></div><Link href={`/app/${businessSlug}/jobs/${jobId}`}>Back to job</Link></header>
    <section className="workspace-panel"><JobForm action={updateJob.bind(null, businessSlug, jobId)} customers={customers ?? []} locations={locations ?? []} services={services ?? []} technicians={technicians ?? []} job={formJob} submitLabel="Save job"/></section>
  </section></main>;
}
