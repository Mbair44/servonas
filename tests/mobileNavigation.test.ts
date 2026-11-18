import assert from "node:assert/strict";
import test from "node:test";
import type { Workspace } from "@servonas/shared";
import { allowedExperiences, selectedExperience, selectedWorkspace } from "../apps/mobile/lib/navigation.ts";
import { clearForAccountChange, clearForExperienceChange, clearForWorkspaceChange, mobileMeQueryKey, refreshAuthorizedWorkspaces, tenantQueryKey } from "../apps/mobile/lib/queryState.ts";
import { jobSubtitle, statusLabel, timeLabel } from "../apps/mobile/lib/presentation.ts";

const workspaces: Workspace[] = [
  { id: "00000000-0000-4000-8000-000000000001", displayName: "Office", membershipRole: "owner", technicianEligible: false, availableCapabilities: ["operational_dashboard", "financial_dashboard"] },
  { id: "00000000-0000-4000-8000-000000000002", displayName: "Field", membershipRole: "staff", technicianEligible: true, availableCapabilities: ["assigned_jobs_read"] },
];

test("selects a persisted authorized workspace and falls back when it is removed", () => {
  assert.equal(selectedWorkspace(workspaces, workspaces[1].id)?.displayName, "Field");
  assert.equal(selectedWorkspace(workspaces, "removed-workspace")?.displayName, "Office");
  assert.equal(selectedWorkspace([], workspaces[0].id), null);
});

test("exposes only verified office and technician experiences", () => {
  assert.deepEqual(allowedExperiences(workspaces[0]), ["office"]);
  assert.deepEqual(allowedExperiences(workspaces[1]), ["technician"]);
  assert.equal(selectedExperience(workspaces[0], "technician"), "office");
  assert.equal(selectedExperience({ ...workspaces[1], technicianEligible: false, availableCapabilities: [] }, "technician"), null);
});

test("clears tenant data on workspace and account changes, then revalidates /me", async () => {
  const calls: Array<{ method: string; filters?: { queryKey: readonly unknown[] } }> = [];
  const client = {
    clear: () => calls.push({ method: "clear" }),
    removeQueries: (filters: { queryKey: readonly unknown[] }) => calls.push({ method: "remove", filters }),
    invalidateQueries: async (filters: { queryKey: readonly unknown[] }) => { calls.push({ method: "invalidate", filters }); },
  };
  clearForWorkspaceChange(client);
  clearForAccountChange(client);
  await refreshAuthorizedWorkspaces(client, "user-1");
  clearForExperienceChange(client);
  assert.deepEqual(calls, [
    { method: "remove", filters: { queryKey: ["tenant"] } },
    { method: "clear" },
    { method: "invalidate", filters: { queryKey: mobileMeQueryKey("user-1") } },
    { method: "remove", filters: { queryKey: ["tenant"] } },
  ]);
});

test("tenant data keys isolate the authenticated user, workspace, and resource", () => {
  assert.deepEqual(
    tenantQueryKey("user-a", workspaces[0].id, "job", "job-a"),
    ["tenant", "user-a", workspaces[0].id, "job", "job-a"],
  );
  assert.notDeepEqual(
    tenantQueryKey("user-a", workspaces[0].id, "owner-home"),
    tenantQueryKey("user-b", workspaces[0].id, "owner-home"),
  );
});

test("native job presentation handles absent schedule and customer data safely", () => {
  assert.equal(statusLabel("in_progress"), "In Progress");
  assert.equal(timeLabel(null), "Time not scheduled");
  assert.equal(jobSubtitle({ customerDisplayName: null, serviceName: null, serviceAddress: null }), "Details available in the job");
  assert.equal(jobSubtitle({ customerDisplayName: "Taylor", serviceName: "Installation", serviceAddress: null }), "Taylor · Installation");
});
