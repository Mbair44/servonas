import { transitionJobStatusRequestSchema, transitionJobStatusResponseSchema } from "@servonas/shared";
import { changeJobStatusWorkflow, JobStatusWorkflowError } from "@/lib/jobs/changeJobStatus";
import { createMobileAuthorizationContext, MobileApiError, newMobileRequestId, requireMobileWorkspace } from "@/lib/mobileApi";
import { handleMobileApiError, mobileError, mobileSuccess } from "@/lib/mobileApiResponse";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ businessId: string; jobId: string }> }) {
  const requestId = newMobileRequestId();
  try {
    const { businessId, jobId } = await params;
    const input = transitionJobStatusRequestSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new MobileApiError("VALIDATION_FAILED", "Provide a valid status update.", 400);
    const context = await createMobileAuthorizationContext(request);
    const workspace = requireMobileWorkspace(context, businessId);
    // This intentionally mirrors the existing web status action's office
    // authorization. Technician lifecycle transitions remain on their
    // hardened, assignment-specific RPC path and are not exposed here.
    if (workspace.membershipRole !== "owner" && workspace.membershipRole !== "admin" && workspace.membershipRole !== "manager") {
      throw new MobileApiError("FORBIDDEN", "Office job-management access is required.", 403);
    }
    let result;
    try {
      result = await changeJobStatusWorkflow({
        supabase: context.supabase,
        businessId,
        actorUserId: context.user.id,
        jobId,
        status: input.data.status,
        expectedCurrentStatus: input.data.expectedCurrentStatus,
      });
    } catch (error) {
      if (error instanceof JobStatusWorkflowError) {
        const code = error.code === "NOT_FOUND" ? "NOT_FOUND" : error.code === "STALE" ? "PRECONDITION_FAILED" : error.code === "INVALID_STATUS" || error.code === "INVALID_TRANSITION" ? "VALIDATION_FAILED" : "SERVICE_UNAVAILABLE";
        const status = error.code === "NOT_FOUND" ? 404 : error.code === "STALE" ? 412 : error.code === "INVALID_STATUS" || error.code === "INVALID_TRANSITION" ? 400 : 503;
        throw new MobileApiError(code, error.message, status, status === 503);
      }
      throw error;
    }
    const data = transitionJobStatusResponseSchema.parse({ data: { jobId, ...result }, requestId }).data;
    return mobileSuccess(data, requestId);
  } catch (error) {
    return handleMobileApiError(error, requestId);
  }
}

const unsupported = () => mobileError(new MobileApiError("NOT_FOUND", "This method is not supported.", 405), newMobileRequestId(), { headers: { allow: "POST" } });
export const GET = unsupported;
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
