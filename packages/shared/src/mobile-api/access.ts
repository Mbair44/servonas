import { z } from "zod";
import { uuidSchema } from "./common.js";

/** Tenant membership is distinct from an employee's field-service eligibility. */
export const membershipRoleSchema = z.enum(["owner", "admin", "manager", "staff"]);

export const mobileCapabilitySchema = z.enum([
  "operational_dashboard",
  "financial_dashboard",
  "assigned_jobs_read",
  "assigned_job_notes_write",
  "assigned_job_photos_write",
  "assigned_job_lifecycle_transition",
  "foreground_location_share",
]);

export const workspaceSchema = z.object({
  id: uuidSchema,
  displayName: z.string().trim().min(1).max(200),
  membershipRole: membershipRoleSchema,
  technicianEligible: z.boolean(),
  availableCapabilities: z.array(mobileCapabilitySchema).max(20),
}).strict().superRefine((workspace, ctx) => {
  const capabilities = new Set(workspace.availableCapabilities);
  if (capabilities.size !== workspace.availableCapabilities.length) {
    ctx.addIssue({ code: "custom", message: "Capabilities must not contain duplicates.", path: ["availableCapabilities"] });
  }
  if (workspace.membershipRole === "staff" && capabilities.has("operational_dashboard")) {
    ctx.addIssue({ code: "custom", message: "Staff membership does not grant the operational dashboard.", path: ["availableCapabilities"] });
  }
  if (!["owner", "admin"].includes(workspace.membershipRole) && capabilities.has("financial_dashboard")) {
    ctx.addIssue({ code: "custom", message: "Financial dashboard access is owner/admin only.", path: ["availableCapabilities"] });
  }
  const technicianCapabilities = [
    "assigned_jobs_read",
    "assigned_job_notes_write",
    "assigned_job_photos_write",
    "assigned_job_lifecycle_transition",
    "foreground_location_share",
  ] as const;
  if (!workspace.technicianEligible && technicianCapabilities.some((capability) => capabilities.has(capability))) {
    ctx.addIssue({ code: "custom", message: "Technician capabilities require technician eligibility.", path: ["technicianEligible"] });
  }
});

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type MobileCapability = z.infer<typeof mobileCapabilitySchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
