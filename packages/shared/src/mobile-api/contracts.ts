import { z } from "zod";
import { mobileSuccessEnvelopeSchema, isoDateSchema, isoDateTimeSchema, requestIdSchema, uuidSchema } from "./common.ts";
import { workspaceSchema } from "./access.ts";

export const jobStatusSchema = z.enum([
  "draft", "pending", "confirmed", "scheduled", "dispatched", "en_route",
  "arrived", "in_progress", "completed", "canceled", "declined",
]);
export const jobPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const assignmentRoleSchema = z.enum(["primary", "helper"]);
export const technicianJobActionSchema = z.enum([
  "add_note",
  "upload_photo",
  "transition_status",
  "share_foreground_location",
]);

export const meResponseDataSchema = z.object({
  user: z.object({
    id: uuidSchema,
    email: z.string().email(),
    displayName: z.string().trim().min(1).max(200).nullable(),
  }).strict(),
  workspaces: z.array(workspaceSchema).max(100),
  serverTime: isoDateTimeSchema,
}).strict();
export const meResponseSchema = mobileSuccessEnvelopeSchema(meResponseDataSchema);

export const assignedJobSummarySchema = z.object({
  id: uuidSchema,
  businessId: uuidSchema,
  jobNumber: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(500),
  status: jobStatusSchema,
  priority: jobPrioritySchema,
  startsAt: isoDateTimeSchema.nullable(),
  arrivalWindowStart: isoDateTimeSchema.nullable(),
  arrivalWindowEnd: isoDateTimeSchema.nullable(),
  customerDisplayName: z.string().trim().min(1).max(300).nullable(),
  serviceName: z.string().trim().min(1).max(300).nullable(),
  serviceAddress: z.string().trim().min(1).max(1000).nullable(),
  assignmentRole: assignmentRoleSchema,
}).strict();

export const operationalDashboardSchema = z.object({
  asOfDate: isoDateSchema,
  timezone: z.string().trim().min(1).max(100),
  jobsToday: z.number().int().nonnegative(),
  inProgressJobs: z.number().int().nonnegative(),
  unassignedJobs: z.number().int().nonnegative(),
  pendingBookings: z.number().int().nonnegative(),
  techniciansWorking: z.number().int().nonnegative(),
  todayJobs: z.array(assignedJobSummarySchema.omit({ assignmentRole: true })).max(100),
}).strict();

export const financialDashboardSchema = z.object({
  paymentsTodayCents: z.number().int().nonnegative(),
  paymentsMonthCents: z.number().int().nonnegative(),
  outstandingInvoiceCents: z.number().int().nonnegative(),
  overdueInvoiceCents: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).strict();

export const ownerManagerDashboardDataSchema = z.object({
  workspace: workspaceSchema,
  generatedAt: isoDateTimeSchema,
  operational: operationalDashboardSchema,
  financial: financialDashboardSchema.nullable(),
}).strict().superRefine((response, ctx) => {
  if (response.workspace.membershipRole === "staff") {
    ctx.addIssue({ code: "custom", message: "Staff has no owner dashboard in Phase 1.", path: ["workspace", "membershipRole"] });
  }
  if (response.workspace.membershipRole === "manager" && response.financial !== null) {
    ctx.addIssue({ code: "custom", message: "Managers must not receive owner-only financial data.", path: ["financial"] });
  }
});
export const ownerManagerDashboardResponseSchema = mobileSuccessEnvelopeSchema(ownerManagerDashboardDataSchema);

export const technicianHomeDataSchema = z.object({
  workspace: workspaceSchema,
  generatedAt: isoDateTimeSchema,
  technician: z.object({
    id: uuidSchema,
    employeeId: uuidSchema,
    displayName: z.string().trim().min(1).max(200),
  }).strict(),
  currentJob: assignedJobSummarySchema.nullable(),
  todayJobs: z.array(assignedJobSummarySchema).max(100),
  upcomingJobs: z.array(assignedJobSummarySchema).max(100),
}).strict().superRefine((response, ctx) => {
  if (!response.workspace.technicianEligible) {
    ctx.addIssue({ code: "custom", message: "Technician home requires technician eligibility.", path: ["workspace", "technicianEligible"] });
  }
});
export const technicianHomeResponseSchema = mobileSuccessEnvelopeSchema(technicianHomeDataSchema);

export const mobileJobsRangeSchema = z.enum(["today", "upcoming", "past"]);
export const mobileJobsQuerySchema = z.object({
  range: mobileJobsRangeSchema.default("today"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export const mobileJobsListDataSchema = z.object({
  workspace: workspaceSchema,
  timezone: z.string().trim().min(1).max(100),
  range: mobileJobsRangeSchema,
  items: z.array(assignedJobSummarySchema).max(100),
  truncated: z.boolean(),
}).strict();
export const mobileJobsListResponseSchema = mobileSuccessEnvelopeSchema(mobileJobsListDataSchema);

export const jobDetailDataSchema = z.object({
  workspace: workspaceSchema,
  job: z.object({
    id: uuidSchema,
    businessId: uuidSchema,
    jobNumber: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(500),
    description: z.string().max(10_000).nullable(),
    status: jobStatusSchema,
    priority: jobPrioritySchema,
    startsAt: isoDateTimeSchema.nullable(),
    endsAt: isoDateTimeSchema.nullable(),
    arrivalWindowStart: isoDateTimeSchema.nullable(),
    arrivalWindowEnd: isoDateTimeSchema.nullable(),
    customer: z.object({
      id: uuidSchema,
      displayName: z.string().trim().min(1).max(300),
      phone: z.string().trim().min(1).max(50).nullable(),
    }).strict().nullable(),
    service: z.object({ id: uuidSchema, name: z.string().trim().min(1).max(300) }).strict().nullable(),
    serviceAddress: z.string().trim().min(1).max(1000).nullable(),
  }).strict(),
  assignment: z.object({
    role: assignmentRoleSchema.nullable(),
    allowedActions: z.array(technicianJobActionSchema).max(10),
  }).strict(),
  notes: z.array(z.object({
    id: uuidSchema,
    body: z.string().trim().min(1).max(4000),
    authorName: z.string().trim().min(1).max(200),
    createdAt: isoDateTimeSchema,
  }).strict()).max(100),
}).strict().superRefine((response, ctx) => {
  const actions = new Set(response.assignment.allowedActions);
  if (actions.size !== response.assignment.allowedActions.length) {
    ctx.addIssue({ code: "custom", message: "Allowed actions must not contain duplicates.", path: ["assignment", "allowedActions"] });
  }
  if (response.assignment.role === "helper" && actions.has("transition_status")) {
    ctx.addIssue({ code: "custom", message: "Only the primary technician may transition a shared job.", path: ["assignment", "allowedActions"] });
  }
});
export const jobDetailResponseSchema = mobileSuccessEnvelopeSchema(jobDetailDataSchema);

export const transitionJobStatusRequestSchema = z.object({
  status: z.enum(["en_route", "arrived", "in_progress", "completed"]),
  idempotencyKey: uuidSchema,
  expectedCurrentStatus: jobStatusSchema.optional(),
}).strict();

export const addJobNoteRequestSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  idempotencyKey: uuidSchema,
}).strict();
export const addJobNoteDataSchema = z.object({jobId: uuidSchema,noteId: uuidSchema}).strict();
export const addJobNoteResponseSchema = mobileSuccessEnvelopeSchema(addJobNoteDataSchema);

export const foregroundLocationRequestSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0).max(5000),
  capturedAt: isoDateTimeSchema,
  headingDegrees: z.number().finite().min(0).max(360).nullable().optional(),
  speedMetersPerSecond: z.number().finite().min(0).max(200).nullable().optional(),
  startTravel: z.boolean().default(false),
  foregroundConsent: z.literal(true),
  idempotencyKey: requestIdSchema,
}).strict();

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobPriority = z.infer<typeof jobPrioritySchema>;
export type AssignmentRole = z.infer<typeof assignmentRoleSchema>;
export type TechnicianJobAction = z.infer<typeof technicianJobActionSchema>;
export type MeResponseData = z.infer<typeof meResponseDataSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type AssignedJobSummary = z.infer<typeof assignedJobSummarySchema>;
export type OwnerManagerDashboardData = z.infer<typeof ownerManagerDashboardDataSchema>;
export type OwnerManagerDashboardResponse = z.infer<typeof ownerManagerDashboardResponseSchema>;
export type TechnicianHomeData = z.infer<typeof technicianHomeDataSchema>;
export type TechnicianHomeResponse = z.infer<typeof technicianHomeResponseSchema>;
export type MobileJobsRange = z.infer<typeof mobileJobsRangeSchema>;
export type MobileJobsListData = z.infer<typeof mobileJobsListDataSchema>;
export type JobDetailData = z.infer<typeof jobDetailDataSchema>;
export type JobDetailResponse = z.infer<typeof jobDetailResponseSchema>;
export type TransitionJobStatusRequest = z.infer<typeof transitionJobStatusRequestSchema>;
export type AddJobNoteRequest = z.infer<typeof addJobNoteRequestSchema>;
export type AddJobNoteData = z.infer<typeof addJobNoteDataSchema>;
export type AddJobNoteResponse = z.infer<typeof addJobNoteResponseSchema>;
export type ForegroundLocationRequest = z.infer<typeof foregroundLocationRequestSchema>;
