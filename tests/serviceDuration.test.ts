import assert from "node:assert/strict";
import test from "node:test";
import { densityCounts, resolveServiceDuration, technicianMeetsRoutingRequirements } from "../lib/routing/serviceDuration.ts";

test("resolves service duration through the documented fallback order", () => {
  assert.deepEqual(resolveServiceDuration({ jobMinutes: 45, serviceMinutes: 60, priceBookMinutes: 75, businessDefaultMinutes: 90 }), { minutes: 45, source: "job" });
  assert.deepEqual(resolveServiceDuration({ jobMinutes: null, serviceMinutes: 60, priceBookMinutes: 75, businessDefaultMinutes: 90 }), { minutes: 60, source: "service" });
  assert.deepEqual(resolveServiceDuration({ jobMinutes: null, serviceMinutes: null, priceBookMinutes: 75, businessDefaultMinutes: 90 }), { minutes: 75, source: "price_book" });
  assert.deepEqual(resolveServiceDuration({ jobMinutes: null, serviceMinutes: null, priceBookMinutes: null, businessDefaultMinutes: 90 }), { minutes: 90, source: "business_default" });
  assert.deepEqual(resolveServiceDuration({}), { minutes: 60, source: "documented_fallback" });
});

test("never accepts zero or invalid duration silently", () => {
  assert.deepEqual(resolveServiceDuration({ jobMinutes: 0, serviceMinutes: -1, businessDefaultMinutes: 0 }), { minutes: 60, source: "documented_fallback" });
});

test("builds deterministic route density counts", () => {
  assert.deepEqual(densityCounts(["85296", "85296", "85234", null]), [
    { label: "85296", count: 2 }, { label: "85234", count: 1 }, { label: "Not set", count: 1 },
  ]);
});

test("enforces only populated supported routing requirements", () => {
  assert.equal(technicianMeetsRoutingRequirements({ requirements: {}, skills: [], serviceAreas: [], capabilities: {} }), true);
  assert.equal(technicianMeetsRoutingRequirements({ requirements: { skills: ["licensed"], serviceAreas: ["East"], capabilities: ["lift"] }, skills: ["licensed"], serviceAreas: ["East"], capabilities: { lift: true } }), true);
  assert.equal(technicianMeetsRoutingRequirements({ requirements: { skills: ["licensed"] }, skills: [], serviceAreas: [], capabilities: {} }), false);
});
