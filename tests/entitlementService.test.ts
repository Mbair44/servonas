import assert from "node:assert/strict";
import test from "node:test";
import { entitlementAccessMessage, EntitlementAccessError } from "../lib/entitlements/errors.ts";
import { evaluateCapability } from "../lib/entitlements/evaluate.ts";

const suspended = evaluateCapability({
  id: "entitlement",
  entitlement_key: "pilot",
  status: "suspended",
  starts_at: "2026-01-01T00:00:00Z",
  ends_at: null,
}, "customer_migration", new Date("2026-07-28T00:00:00Z"));

test("inactive entitlement messages preserve data and avoid billing-provider details", () => {
  const message = entitlementAccessMessage(suspended);
  assert.match(message, /temporarily suspended/i);
  assert.doesNotMatch(message, /stripe|subscription|card/i);
});

test("entitlement assertion errors retain the structured access result", () => {
  const error = new EntitlementAccessError(suspended);
  assert.equal(error.access.reason, "suspended");
  assert.equal(error.access.capability, "customer_migration");
});
