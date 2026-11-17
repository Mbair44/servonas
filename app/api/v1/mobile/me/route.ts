import { meResponseDataSchema } from "@servonas/shared";
import {
  MobileApiError,
  createMobileAuthorizationContext,
  newMobileRequestId,
} from "@/lib/mobileApi";
import { handleMobileApiError, mobileError, mobileSuccess } from "@/lib/mobileApiResponse";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = newMobileRequestId();
  try {
    const context = await createMobileAuthorizationContext(request);
    const email = context.user.email?.trim();
    if (!email) {
      console.error("mobile_me_user_missing_email", { requestId, userId: context.user.id });
      throw new MobileApiError("PRECONDITION_FAILED", "This account needs an email address to use the mobile app.", 412);
    }
    const data = meResponseDataSchema.parse({
      user: {
        id: context.user.id,
        email,
        displayName: typeof context.user.user_metadata?.full_name === "string" && context.user.user_metadata.full_name.trim()
          ? context.user.user_metadata.full_name.trim().slice(0, 200)
          : null,
      },
      workspaces: context.workspaces,
      serverTime: new Date().toISOString(),
    });
    return mobileSuccess(data, requestId);
  } catch (error) {
    return handleMobileApiError(error, requestId);
  }
}

function methodNotAllowed() {
  const requestId = newMobileRequestId();
  return mobileError(new MobileApiError("NOT_FOUND", "This method is not supported.", 405), requestId, { headers: { allow: "GET" } });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
