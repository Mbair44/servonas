import assert from "node:assert/strict";
import test from "node:test";
import { businessAdminStatus, normalizeCustomerType, ownerAccessLabel } from "../lib/adminBusinessSetupState.ts";

test("normalizes customer type to supported values", () => {
  assert.equal(normalizeCustomerType("pilot"), "pilot");
  assert.equal(normalizeCustomerType("internal_test"), "internal_test");
  assert.equal(normalizeCustomerType("anything-else"), "standard");
});

test("derives business admin status from lifecycle and owner activation", () => {
  assert.equal(businessAdminStatus({ lifecycleStatus: "deactivated", ownerStatus: "activated" }), "Suspended");
  assert.equal(businessAdminStatus({ lifecycleStatus: "active", ownerStatus: "activated" }), "Active");
  assert.equal(businessAdminStatus({ lifecycleStatus: "active", ownerStatus: "invited" }), "Invite sent");
  assert.equal(businessAdminStatus({ lifecycleStatus: "active", ownerStatus: "not_invited" }), "Setup");
});

test("renders owner access labels without leaking implementation details", () => {
  assert.equal(ownerAccessLabel("not_invited"), "Not invited");
  assert.match(ownerAccessLabel("invited", "2026-08-26T18:00:00.000Z"), /^Invitation sent /);
  assert.match(ownerAccessLabel("activated", "2026-08-26T18:00:00.000Z"), /^Activated /);
});
