"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import { availableJobTransitions, canTransitionJob, type JobStatus } from "@/lib/jobStatusTransitions";
import { validateJobSchedule } from "@/lib/jobScheduling";
import { requireWorkspace } from "@/lib/workspace";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const dispatchPath = (slug: string, date: string, kind: "error" | "success", message: string) =>
  `/app/${slug}/dispatch?date=${encodeURIComponent(date)}&${kind}=${encodeURIComponent(message)}`;

async function updateTechnicianOperationalState(
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"],
  businessId: string,
  technicianId: string | null,
  status: JobStatus,
) {
  if (!technicianId) return;
  const technicianStatus = status === "en_route" ? "en_route"
    : status === "arrived" || status === "in_progress" ? "on_site"
      : status === "dispatched" || status === "scheduled" ? "assigned"
        : status === "completed" ? "available" : null;
  if (!technicianStatus) return;
  const { error } = await supabase.from("technician_profiles").update({ technician_status: technicianStatus }).eq("id", technicianId).eq("business_id", businessId).neq("technician_status", "off_duty");
  if (error) console.error("Technician operational state update failed", { code: error.code, businessId, technicianId });
}

export async function assignDispatchJob(slug: string, jobId: string, formData: FormData) {
  const { supabase, business, role } = await requireWorkspace(slug);
  const date = text(formData, "date");
  if (!canManageCustomers(role)) redirect(dispatchPath(slug, date, "error", "Permission denied."));
  const technicianId = text(formData, "technicianId") || null;
  const { data: job } = await supabase.from("jobs").select("id,status,starts_at,ends_at,arrival_window_start,arrival_window_end,assigned_technician_id").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!job) redirect(dispatchPath(slug, date, "error", "Job not found."));
  if (technicianId) {
    const { data: technician } = await supabase.from("technician_profiles").select("id,technician_status").eq("id", technicianId).eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true).maybeSingle();
    if (!technician) redirect(dispatchPath(slug, date, "error", "Technician is not assignable."));
    if (technician.technician_status === "off_duty") redirect(dispatchPath(slug, date, "error", "Technician is off duty."));
  }
  const startsAt = job.starts_at ? new Date(job.starts_at) : null;
  const endsAt = job.ends_at ? new Date(job.ends_at) : null;
  const conflict = await validateJobSchedule({
    supabase, businessId: business.id, timeZone: business.timezone,
    startsAt, endsAt,
    arrivalWindowStart: job.arrival_window_start ? new Date(job.arrival_window_start) : null,
    arrivalWindowEnd: job.arrival_window_end ? new Date(job.arrival_window_end) : null,
    technicianId, excludeJobId: jobId,
  });
  if (conflict) redirect(dispatchPath(slug, date, "error", conflict));
  const { error } = await supabase.rpc("set_job_primary_technician", { p_job_id: jobId, p_technician_id: technicianId });
  if (error) {
    console.error("Dispatch assignment failed", { code: error.code, businessId: business.id, jobId });
    redirect(dispatchPath(slug, date, "error", "Assignment could not be updated."));
  }
  if (job.assigned_technician_id && job.assigned_technician_id !== technicianId) {
    await supabase.from("technician_profiles").update({ technician_status: "available" }).eq("id", job.assigned_technician_id).eq("business_id", business.id).neq("technician_status", "off_duty");
  }
  if (technicianId) {
    await supabase.from("technician_profiles").update({ technician_status: "assigned" }).eq("id", technicianId).eq("business_id", business.id).neq("technician_status", "off_duty");
  }
  revalidatePath(`/app/${slug}/dispatch`); revalidatePath(`/app/${slug}/schedule`); revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(dispatchPath(slug, date, "success", technicianId ? "Job assigned." : "Job moved to unassigned."));
}

export async function updateDispatchStatus(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  const date = text(formData, "date");
  if (!canManageCustomers(role)) redirect(dispatchPath(slug, date, "error", "Permission denied."));
  const requested = text(formData, "status") as JobStatus;
  const { data: job } = await supabase.from("jobs").select("id,status,assigned_technician_id").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!job) redirect(dispatchPath(slug, date, "error", "Job not found."));
  const current = job.status as JobStatus;
  if (!availableJobTransitions(current).includes(requested) || !canTransitionJob(current, requested)) {
    redirect(dispatchPath(slug, date, "error", `Cannot change ${current.replaceAll("_", " ")} to ${requested.replaceAll("_", " ")}.`));
  }
  if (requested === "dispatched" && !job.assigned_technician_id) {
    redirect(dispatchPath(slug, date, "error", "Assign a technician before dispatching."));
  }
  const now = new Date().toISOString();
  const timestamps = requested === "arrived" ? { actual_arrival_at: now }
    : requested === "in_progress" ? { work_started_at: now }
      : requested === "completed" ? { work_completed_at: now } : {};
  const { error } = await supabase.from("jobs").update({ status: requested, ...timestamps, updated_by: user.id }).eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false);
  if (error) {
    console.error("Dispatch status update failed", { code: error.code, businessId: business.id, jobId });
    redirect(dispatchPath(slug, date, "error", "Job status could not be updated."));
  }
  await updateTechnicianOperationalState(supabase, business.id, job.assigned_technician_id, requested);
  revalidatePath(`/app/${slug}/dispatch`); revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(dispatchPath(slug, date, "success", "Job status updated."));
}
