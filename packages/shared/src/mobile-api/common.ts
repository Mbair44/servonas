import { z } from "zod";

/** Stable API version for the first native client contract. */
export const mobileApiVersion = "v1" as const;
export const mobileApiPaths = {
  me: "/api/v1/mobile/me",
  ownerManagerDashboard: "/api/v1/mobile/businesses/:businessId/owner-home",
  technicianHome: "/api/v1/mobile/businesses/:businessId/employee-home",
  jobsList: "/api/v1/mobile/businesses/:businessId/jobs",
  jobDetail: "/api/v1/mobile/businesses/:businessId/jobs/:jobId",
  transitionJobStatus: "/api/v1/mobile/businesses/:businessId/jobs/:jobId/status",
  addJobNote: "/api/v1/mobile/businesses/:businessId/jobs/:jobId/notes",
  foregroundLocation: "/api/v1/mobile/businesses/:businessId/jobs/:jobId/location",
  conversations: "/api/v1/mobile/businesses/:businessId/conversations",
  conversationMessages: "/api/v1/mobile/businesses/:businessId/conversations/:conversationKey/messages",
  conversationMedia: "/api/v1/mobile/businesses/:businessId/conversation-media/:attachmentId",
  conversationAttachmentUpload: "/api/v1/mobile/businesses/:businessId/conversation-attachments",
  markConversationRead: "/api/v1/mobile/businesses/:businessId/conversations/:conversationKey/read",
} as const;

export const uuidSchema = z.uuid();
export const requestIdSchema = uuidSchema;
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date.");

export const mobileErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "RATE_LIMITED",
  "REQUEST_TOO_LARGE",
  "UNSUPPORTED_VERSION",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const mobileErrorSchema = z.object({
  code: mobileErrorCodeSchema,
  message: z.string().min(1).max(500),
  requestId: requestIdSchema,
  retryable: z.boolean(),
}).strict();

export const mobileErrorEnvelopeSchema = z.object({
  error: mobileErrorSchema,
}).strict();

export function mobileSuccessEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({
    data,
    requestId: requestIdSchema,
  }).strict();
}

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
}).strict();

export function paginatedDataSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().min(1).max(512).nullable(),
  }).strict();
}

export type MobileErrorCode = z.infer<typeof mobileErrorCodeSchema>;
export type MobileError = z.infer<typeof mobileErrorSchema>;
export type MobileErrorEnvelope = z.infer<typeof mobileErrorEnvelopeSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
