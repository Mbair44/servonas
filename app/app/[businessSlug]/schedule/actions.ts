"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import { JobNotificationService } from "@/lib/communications/jobNotificationService";
import { zonedDateTimeToUtc } from "@/lib/bookingTime";
import { validateJobSchedule } from "@/lib/jobScheduling";
import { requireWorkspace } from "@/lib/workspace";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const localDate = (value: string, timeZone: string) => {
  const [date, time] = value.split("T");
  if (!date || !time) return null;
  const parsed = zonedDateTimeToUtc(date, time.slice(0, 5), timeZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const returnPath = (slug: string, value: string) =>
  value.startsWith(`/app/${slug}/schedule`) && !value.startsWith("//") ? value : `/app/${slug}/schedule`;
const resultUrl = (path: string, kind: "error" | "success", message: string) => {
  const url = new URL(path, "http://servonas.local");
  url.searchParams.set(kind, message);
  return `${url.pathname}${url.search}`;
};

export async function updateScheduledJob(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  const back = returnPath(slug, text(formData, "returnPath"));
  if (!canManageCustomers(role)) redirect(resultUrl(back, "error", "You do not have permission to schedule jobs."));
  const { data: job } = await supabase.from("jobs").select("id,arrival_window_start,arrival_window_end").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!job) redirect(resultUrl(back, "error", "Job not found."));
  const startsAt = localDate(text(formData, "startsAt"), business.timezone);
  const duration = Number(text(formData, "durationMinutes"));
  if (!startsAt || !Number.isInteger(duration) || duration < 15 || duration > 10080) {
    redirect(resultUrl(back, "error", "Enter a valid start and duration."));
  }
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);
  const technicianId = text(formData, "technicianId") || null;
  if (technicianId) {
    const { data: technician } = await supabase.from("technician_profiles").select("id").eq("id", technicianId).eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true).maybeSingle();
    if (!technician) redirect(resultUrl(back, "error", "Technician is not assignable."));
  }
  const conflict = await validateJobSchedule({
    supabase, businessId: business.id, timeZone: business.timezone,
    startsAt, endsAt,
    arrivalWindowStart: job.arrival_window_start ? new Date(job.arrival_window_start) : null,
    arrivalWindowEnd: job.arrival_window_end ? new Date(job.arrival_window_end) : null,
    technicianId, excludeJobId: jobId,
  });
  if (conflict) redirect(resultUrl(back, "error", conflict));
  const { error } = await supabase.from("jobs").update({
    starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
    estimated_duration_minutes: duration, updated_by: user.id,
  }).eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false);
  if (error) {
    console.error("Schedule update failed", { code: error.code, businessId: business.id, jobId });
    redirect(resultUrl(back, "error", "The job could not be rescheduled."));
  }
  const { error: assignmentError } = await supabase.rpc("set_job_primary_technician", { p_job_id: jobId, p_technician_id: technicianId });
  if (assignmentError) {
    console.error("Schedule assignment failed", { code: assignmentError.code, businessId: business.id, jobId });
    redirect(resultUrl(back, "error", "The time was saved, but assignment could not be updated."));
  }
  await JobNotificationService.jobRescheduled(jobId);
  revalidatePath(`/app/${slug}/schedule`);
  revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(resultUrl(back, "success", "Schedule updated."));
}
