import assert from "node:assert/strict";
import test from "node:test";
import {
  MobileApiError,
  mobileCapabilitiesFor,
  parseMobileBearerToken,
  projectMobileWorkspaces,
  requireMobileWorkspace,
} from "../lib/mobileApi.ts";

const ids = { user: "u-1", businessA: "00000000-0000-4000-8000-000000000001", businessB: "00000000-0000-4000-8000-000000000002", employee: "00000000-0000-4000-8000-000000000003", technician: "00000000-0000-4000-8000-000000000004" };
const memberships = [{ business_id: ids.businessA, role: "staff", businesses: { id: ids.businessA, name: "A" } }, { business_id: ids.businessB, role: "manager", businesses: { id: ids.businessB, name: "B" } }];

test("rejects missing and malformed mobile bearer credentials", () => {
  for (const value of [null, "Basic abc", "Bearer", "Bearer one two"]) {
    assert.throws(() => parseMobileBearerToken(new Request("https://example.test", value ? { headers: { authorization: value } } : {})), (error: unknown) => error instanceof MobileApiError && error.code === "UNAUTHENTICATED");
  }
  assert.equal(parseMobileBearerToken(new Request("https://example.test", { headers: { authorization: "Bearer token.value" } })), "token.value");
});

test("projects multiple current memberships and never treats staff as a technician", () => {
  const projected = projectMobileWorkspaces(memberships, [], [], ids.user);
  assert.equal(projected.workspaces.length, 2);
  assert.deepEqual(projected.workspaces[0].availableCapabilities, []);
  assert.deepEqual(projected.workspaces[1].availableCapabilities, ["operational_dashboard"]);
});

test("returns no workspaces for an authenticated user with no current memberships", () => {
  assert.deepEqual(projectMobileWorkspaces([], [], [], ids.user).workspaces, []);
});

test("requires an active technician profile linked to an active employee", () => {
  const technician = { business_id: ids.businessA, id: ids.technician, employee_id: ids.employee, is_active: true, is_technician: true, can_be_assigned_jobs: true };
  const inactiveEmployee = { business_id: ids.businessA, id: ids.employee, auth_user_id: ids.user, is_active: false };
  assert.equal(projectMobileWorkspaces(memberships, [technician], [inactiveEmployee], ids.user).workspaces[0].technicianEligible, false);
  const activeEmployee = { ...inactiveEmployee, is_active: true };
  const active = projectMobileWorkspaces(memberships, [technician], [activeEmployee], ids.user).workspaces[0];
  assert.equal(active.technicianEligible, true);
  assert.ok(active.availableCapabilities.includes("assigned_jobs_read"));
});

test("projects role capabilities without platform-admin email bypass", () => {
  assert.deepEqual(mobileCapabilitiesFor("owner", false), ["operational_dashboard", "financial_dashboard"]);
  assert.deepEqual(mobileCapabilitiesFor("admin", false), ["operational_dashboard", "financial_dashboard"]);
  assert.deepEqual(mobileCapabilitiesFor("manager", false), ["operational_dashboard"]);
  assert.deepEqual(mobileCapabilitiesFor("staff", false), []);
});

test("excludes removed and invalid tenant memberships from the mobile projection", () => {
  const projected = projectMobileWorkspaces([{ business_id: ids.businessA, role: "platform_admin", businesses: { id: ids.businessA, name: "Ignored" } }], [], [], ids.user);
  assert.deepEqual(projected.workspaces, []);
});

test("denies a requested workspace outside the authenticated membership projection", () => {
  const context = { workspaces: projectMobileWorkspaces(memberships, [], [], ids.user).workspaces };
  assert.throws(
    () => requireMobileWorkspace(context as never, "00000000-0000-4000-8000-000000000099"),
    (error: unknown) => error instanceof MobileApiError && error.code === "FORBIDDEN",
  );
});
