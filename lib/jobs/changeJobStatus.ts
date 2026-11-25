import type { SupabaseClient } from "@supabase/supabase-js";
import { JobNotificationService } from "@/lib/communications/jobNotificationService";
import { sendRentalLifecycleSms } from "@/lib/communications/rentalLifecycleSms";
import { processCompletedJobBilling } from "@/lib/financial/recurringBilling";
import { canTransitionJob, type JobStatus } from "@/lib/jobStatusTransitions";
import { jobStatuses } from "@/lib/jobValidation";

export class JobStatusWorkflowError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "INVALID_STATUS" | "INVALID_TRANSITION" | "STALE" | "UPDATE_FAILED" | "BILLING_ATTENTION_REQUIRED",
    message: string,
  ) { super(message); }
}

export type ChangeJobStatusInput = {
  supabase: SupabaseClient;
  businessId: string;
  actorUserId: string;
  jobId: string;
  status: string;
  expectedCurrentStatus?: string;
};

export type ChangeJobStatusResult = {
  status: JobStatus;
  changed: boolean;
  completionMessage: string;
  billingRequiresAttention: boolean;
};

/**
 * The one authoritative office job-status workflow. Callers must authorize the
 * actor for job management before invoking it. Keeping side effects here means
 * web and mobile status changes preserve their established ordering.
 */
export async function changeJobStatusWorkflow(input: ChangeJobStatusInput): Promise<ChangeJobStatusResult> {
  if (!jobStatuses.includes(input.status as JobStatus)) {
    throw new JobStatusWorkflowError("INVALID_STATUS", "Invalid status.");
  }
  const status = input.status as JobStatus;
  const { data: currentJob, error: currentError } = await input.supabase
    .from("jobs")
    .select("status")
    .eq("id", input.jobId)
    .eq("business_id", input.businessId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (currentError) throw new JobStatusWorkflowError("UPDATE_FAILED", "Job status could not be checked.");
  if (!currentJob) throw new JobStatusWorkflowError("NOT_FOUND", "Job not found.");
  const currentStatus = currentJob.status as JobStatus;
  if (input.expectedCurrentStatus && input.expectedCurrentStatus !== currentStatus) {
    throw new JobStatusWorkflowError("STALE", "This job changed before your update. Refresh and try again.");
  }
  if (!canTransitionJob(currentStatus, status)) {
    throw new JobStatusWorkflowError("INVALID_TRANSITION", "That status transition is not allowed.");
  }
  // A retry after an acknowledged update is a no-op: never replay lifecycle
  // messages or completed-job billing merely because the status is unchanged.
  if (currentStatus === status) {
    return { status, changed: false, completionMessage: "Status already updated", billingRequiresAttention: false };
  }

  const now = new Date().toISOString();
  const timestamps: Record<string, string> = {};
  if (status === "arrived") timestamps.actual_arrival_at = now;
  if (status === "in_progress") timestamps.work_started_at = now;
  if (status === "completed") timestamps.work_completed_at = now;
  const { data: updated, error } = await input.supabase
    .from("jobs")
    .update({ status, ...timestamps, updated_by: input.actorUserId })
    .eq("id", input.jobId)
    .eq("business_id", input.businessId)
    .eq("is_deleted", false)
    .eq("status", currentStatus)
    .select("status")
    .maybeSingle();
  if (error) throw new JobStatusWorkflowError("UPDATE_FAILED", "Status could not be updated.");
  if (!updated) throw new JobStatusWorkflowError("STALE", "This job changed before your update. Refresh and try again.");

  if (status === "confirmed") await JobNotificationService.jobConfirmed(input.jobId);
  if (status === "en_route") {
    await JobNotificationService.technicianEnRoute(input.jobId);
    await sendRentalLifecycleSms({ jobId: input.jobId, type: "technician_en_route" })
      .catch(() => console.error("Rental on-the-way SMS failed", { businessId: input.businessId, jobId: input.jobId }));
  }
  if (status === "completed") {
    await Promise.allSettled([JobNotificationService.jobCompleted(input.jobId), JobNotificationService.reviewRequest(input.jobId)]);
    const billing = await processCompletedJobBilling(input.jobId);
    if (!billing.ok || billing.action === "payment_failed") {
      console.error("Completed job requires billing attention", { businessId: input.businessId, jobId: input.jobId, reason: billing.error });
      return { status, changed: true, completionMessage: "The job is complete, but the remaining-balance invoice could not be finalized.", billingRequiresAttention: true };
    }
    return { status, changed: true, completionMessage: billing.action === "paid" ? "Job completed and the remaining balance was paid." : "Job completed and the remaining-balance invoice was sent.", billingRequiresAttention: false };
  }
  return { status, changed: true, completionMessage: "Status updated", billingRequiresAttention: false };
}
