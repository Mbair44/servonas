import assert from "node:assert/strict";
import test from "node:test";
import {
  addJobNoteRequestSchema,
  addJobNoteResponseSchema,
  foregroundLocationRequestSchema,
  jobDetailResponseSchema,
  meResponseSchema,
  mobileErrorEnvelopeSchema,
  mobileJobsListResponseSchema,
  mobileConversationListResponseSchema,
  mobileConversationMessagesResponseSchema,
  ownerManagerDashboardResponseSchema,
  paginationQuerySchema,
  transitionJobStatusRequestSchema,
} from "../src/index.ts";

const ids = {
  request: "9f8c5a7a-35cc-4d89-b935-2cb1917b6f93",
  business: "cf1f4f72-8f5a-4c06-96d1-0b5fa64c03e6",
  user: "c3fa33e3-9366-4ad5-8fca-58bd883d780d",
  job: "a79df6b1-68c4-4f68-81f6-f0c5b053a6cf",
  technician: "dda375ce-5c51-4f97-b5d4-0e51f00b2f36",
  employee: "67cb3e89-b30d-423b-9b69-596e69e9826f",
  customer: "e0e2fb9d-e408-4149-938a-e49f60ec341c",
  service: "303b73b2-18db-4744-ae17-1ee08127859f",
};

const primaryWorkspace = {
  id: ids.business,
  displayName: "Acme Services",
  membershipRole: "owner",
  technicianEligible: false,
  availableCapabilities: ["operational_dashboard", "financial_dashboard"],
};

test("accepts a versioned /me success payload for a multi-tenant user", () => {
  const parsed = meResponseSchema.parse({
    data: {
      user: { id: ids.user, email: "owner@example.com", displayName: "Avery Owner" },
      workspaces: [
        primaryWorkspace,
        {
          id: "508041b1-3b0f-4e71-b44a-1d6e9f0752cb",
          displayName: "Second Business",
          membershipRole: "manager",
          technicianEligible: true,
          availableCapabilities: ["operational_dashboard", "assigned_jobs_read", "assigned_job_notes_write"],
        },
      ],
      serverTime: "2026-11-16T18:45:00.000Z",
    },
    requestId: ids.request,
  });
  assert.equal(parsed.data.workspaces.length, 2);
});

test("rejects role and technician capability conflation", () => {
  const staffDashboard = {
    ...primaryWorkspace,
    membershipRole: "staff",
    availableCapabilities: ["operational_dashboard"],
  };
  assert.equal(meResponseSchema.safeParse({ data: { user: { id: ids.user, email: "staff@example.com", displayName: null }, workspaces: [staffDashboard], serverTime: "2026-11-16T18:45:00Z" }, requestId: ids.request }).success, false);

  const nonTechnicianJobAccess = {
    ...primaryWorkspace,
    membershipRole: "manager",
    availableCapabilities: ["operational_dashboard", "assigned_jobs_read"],
  };
  assert.equal(meResponseSchema.safeParse({ data: { user: { id: ids.user, email: "manager@example.com", displayName: null }, workspaces: [nonTechnicianJobAccess], serverTime: "2026-11-16T18:45:00Z" }, requestId: ids.request }).success, false);
});

test("keeps owner financial data out of manager dashboard responses", () => {
  const result = ownerManagerDashboardResponseSchema.safeParse({
    data: {
      workspace: { ...primaryWorkspace, membershipRole: "manager", availableCapabilities: ["operational_dashboard"] },
      generatedAt: "2026-11-16T18:45:00Z",
      operational: { asOfDate: "2026-11-16", timezone: "America/Phoenix", jobsToday: 4, inProgressJobs: 1, unassignedJobs: 0, pendingBookings: 2, techniciansWorking: 2, todayJobs: [] },
      financial: { paymentsTodayCents: 100, paymentsMonthCents: 1000, outstandingInvoiceCents: 10, overdueInvoiceCents: 0, currency: "USD" },
    },
    requestId: ids.request,
  });
  assert.equal(result.success, false);
});

test("allows primary but not helper lifecycle actions", () => {
  const base = {
    workspace: { ...primaryWorkspace, membershipRole: "staff", technicianEligible: true, availableCapabilities: ["assigned_jobs_read", "assigned_job_notes_write", "assigned_job_lifecycle_transition"] },
    job: {
      id: ids.job, businessId: ids.business, jobNumber: 42, title: "Replace filter", description: null,
      status: "dispatched", priority: "normal", startsAt: "2026-11-16T18:45:00Z", endsAt: null,
      arrivalWindowStart: null, arrivalWindowEnd: null,
      customer: { id: ids.customer, displayName: "Jordan Customer", phone: "+15551234567" },
      service: { id: ids.service, name: "Filter service" }, serviceAddress: "1 Main St",
    },
    notes: [],
  };
  assert.equal(jobDetailResponseSchema.safeParse({ data: { ...base, permittedStatusTransitions: [], assignment: { role: "primary", allowedActions: ["transition_status", "add_note"] } }, requestId: ids.request }).success, true);
  assert.equal(jobDetailResponseSchema.safeParse({ data: { ...base, permittedStatusTransitions: [], assignment: { role: "helper", allowedActions: ["transition_status", "add_note"] } }, requestId: ids.request }).success, false);
  assert.equal(jobDetailResponseSchema.safeParse({ data: { ...base, permittedStatusTransitions: ["en_route"], assignment: { role: null, allowedActions: [] } }, requestId: ids.request }).success, true);
});

test("validates mutation inputs, timestamps, and foreground consent", () => {
  assert.equal(transitionJobStatusRequestSchema.safeParse({ status: "completed", idempotencyKey: ids.request, expectedCurrentStatus: "in_progress" }).success, true);
  assert.equal(addJobNoteRequestSchema.safeParse({ body: "", idempotencyKey: ids.request }).success, false);
  assert.equal(addJobNoteResponseSchema.safeParse({ data: { jobId: ids.job, noteId: ids.request }, requestId: ids.request }).success, true);
  assert.equal(foregroundLocationRequestSchema.safeParse({ latitude: 33.4, longitude: -111.8, accuracyMeters: 12, capturedAt: "2026-11-16T18:45:00Z", foregroundConsent: true, idempotencyKey: ids.request }).success, true);
  assert.equal(foregroundLocationRequestSchema.safeParse({ latitude: 33.4, longitude: -111.8, accuracyMeters: 12, capturedAt: "not-a-date", foregroundConsent: false, idempotencyKey: ids.request }).success, false);
});

test("validates bounded, timezone-aware mobile job-list responses", () => {
  assert.equal(mobileJobsListResponseSchema.safeParse({
    data: { workspace: { ...primaryWorkspace, membershipRole: "staff", technicianEligible: true, availableCapabilities: ["assigned_jobs_read"] }, timezone: "America/Phoenix", range: "upcoming", items: [], truncated: false },
    requestId: ids.request,
  }).success, true);
  assert.equal(mobileJobsListResponseSchema.safeParse({ data: { workspace: primaryWorkspace, timezone: "", range: "future", items: [] }, requestId: ids.request }).success, false);
});

test("keeps error and pagination conventions strict for future-compatible clients", () => {
  assert.equal(mobileErrorEnvelopeSchema.safeParse({ error: { code: "RATE_LIMITED", message: "Slow down.", requestId: ids.request, retryable: true, unexpected: "no" } }).success, false);
  assert.deepEqual(paginationQuerySchema.parse({ limit: "25" }), { limit: 25 });
  assert.equal(paginationQuerySchema.safeParse({ limit: 101 }).success, false);
});

test("validates read-only office conversation contracts and rejects malformed keys",()=>{
 const conversation={key:`customer:${ids.customer}`,displayName:"Jordan Customer",phoneNumber:"+15551234567",latestPreview:"Hello",latestAt:"2026-11-19T22:00:00Z",latestDirection:"inbound",unreadCount:1};
 assert.equal(mobileConversationListResponseSchema.safeParse({data:{workspace:primaryWorkspace,items:[conversation],nextCursor:null},requestId:ids.request}).success,true);
 assert.equal(mobileConversationListResponseSchema.safeParse({data:{workspace:primaryWorkspace,items:[{...conversation,key:"customer:not-a-uuid"}],nextCursor:null},requestId:ids.request}).success,false);
 assert.equal(mobileConversationMessagesResponseSchema.safeParse({data:{workspace:primaryWorkspace,key:conversation.key,items:[{id:ids.request,direction:"outbound",body:"Reply",status:"sent",occurredAt:"2026-11-19T22:00:00Z",attachments:[]}],nextCursor:null},requestId:ids.request}).success,true);
});
