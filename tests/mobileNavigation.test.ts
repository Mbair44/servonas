import assert from "node:assert/strict";
import test from "node:test";
import type { Workspace } from "@servonas/shared";
import { allowedExperiences, selectedExperience, selectedWorkspace } from "../apps/mobile/lib/navigation.ts";
import { clearForAccountChange, clearForWorkspaceChange, mobileMeQueryKey, refreshAuthorizedWorkspaces } from "../apps/mobile/lib/queryState.ts";

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
  assert.deepEqual(calls, [
    { method: "remove", filters: { queryKey: ["tenant"] } },
    { method: "clear" },
    { method: "invalidate", filters: { queryKey: mobileMeQueryKey("user-1") } },
  ]);
});
