import { NextResponse } from "next/server";
import { MobileApiError } from "@/lib/mobileApi";

const privateNoStoreHeaders = { "cache-control": "private, no-store, max-age=0", vary: "Authorization" };

export function mobileSuccess(data: unknown, requestId: string, init: ResponseInit = {}) {
  return NextResponse.json({ data, requestId }, { ...init, headers: { ...privateNoStoreHeaders, ...init.headers } });
}

export function mobileError(error: MobileApiError, requestId: string, init: ResponseInit = {}) {
  return NextResponse.json({ error: { code: error.code, message: error.message, requestId, retryable: error.retryable } }, {
    ...init, status: error.status, headers: { ...privateNoStoreHeaders, ...init.headers },
  });
}

export function handleMobileApiError(error: unknown, requestId: string) {
  if (error instanceof MobileApiError) return mobileError(error, requestId);
  console.error("mobile_api_unhandled_error", { requestId, errorName: error instanceof Error ? error.name : "unknown" });
  return mobileError(new MobileApiError("INTERNAL_ERROR", "The request could not be completed.", 500), requestId);
}
