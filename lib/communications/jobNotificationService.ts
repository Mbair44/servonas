import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type JobNotificationEvent =
  | "job_booked" | "job_confirmed" | "technician_assigned"
  | "appointment_reminder" | "technician_en_route" | "job_rescheduled"
  | "job_cancelled" | "job_completed" | "review_request";

async function emit(jobId: string, event: JobNotificationEvent) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn("Job notification stub skipped", { event, jobId, reason: "supabase_unavailable" });
    return { ok: false, error: "Supabase is unavailable." };
  }
  const results = await Promise.all(["email", "sms"].map((channel) =>
    supabase.from("job_communication_events").insert({
      job_id: jobId, channel, template_key: event, status: "stubbed",
    })
  ));
  const failures = results.flatMap((result, index) =>
    result.error ? [{ channel: index === 0 ? "email" : "sms", code: result.error.code }] : []
  );
  if (failures.length) {
    console.error("Job notification stub recording failed", { event, jobId, failures });
    return { ok: false, error: "Notification stubs could not be recorded." };
  }
  console.info("Job notification stubs recorded", { event, jobId });
  return { ok: true, stubbed: true };
}

async function safelyEmit(jobId: string, event: JobNotificationEvent) {
  return emit(jobId, event).catch((error) => {
    console.error("Unexpected job notification stub failure", {
      event, jobId, errorName: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, error: "Notification stub failed unexpectedly." };
  });
}

export const JobNotificationService = {
  emit,
  jobBooked: (id: string) => safelyEmit(id, "job_booked"),
  jobConfirmed: (id: string) => safelyEmit(id, "job_confirmed"),
  technicianAssigned: (id: string) => safelyEmit(id, "technician_assigned"),
  appointmentReminder: (id: string) => safelyEmit(id, "appointment_reminder"),
  technicianEnRoute: (id: string) => safelyEmit(id, "technician_en_route"),
  jobRescheduled: (id: string) => safelyEmit(id, "job_rescheduled"),
  jobCancelled: (id: string) => safelyEmit(id, "job_cancelled"),
  jobCompleted: (id: string) => safelyEmit(id, "job_completed"),
  reviewRequest: (id: string) => safelyEmit(id, "review_request"),
};
