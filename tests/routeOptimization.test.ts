import assert from "node:assert/strict";
import test from "node:test";
import { adjacentOptimizationCandidates, candidateMeetsAppointmentWindows, positiveRoadSavings, type OptimizationStop } from "../lib/routing/optimization.ts";

const stop = (jobId: string, overrides: Partial<OptimizationStop> = {}): OptimizationStop => ({
  jobId, status: "scheduled", isLocked: false, startsAt: "2026-07-26T15:00:00Z",
  appointmentWindowStart: null, appointmentWindowEnd: null, serviceDurationSeconds: 1800, ...overrides,
});

test("generates only adjacent candidates and preserves protected stops", () => {
  const candidates = adjacentOptimizationCandidates(
    [stop("a", { isLocked: true }), stop("b"), stop("c")],
    new Date("2026-07-25T00:00:00Z"),
  );
  assert.deepEqual(candidates.map((candidate) => candidate.map((item) => item.jobId)), [["a", "c", "b"]]);
});

test("protects completed, active, and imminent work", () => {
  const candidates = adjacentOptimizationCandidates(
    [stop("a", { status: "completed" }), stop("b"), stop("c", { startsAt: "2026-07-25T00:30:00Z" })],
    new Date("2026-07-25T00:00:00Z"),
  );
  assert.equal(candidates.length, 0);
});

test("rejects a road candidate that misses an appointment window or working-day end", () => {
  const stops = [stop("a"), stop("b", { appointmentWindowEnd: "2026-07-26T15:45:00Z" })];
  const legs = [{ fromWaypointId: "a", toWaypointId: "b", drivingDistanceMeters: 1000, drivingDurationSeconds: 1800, encodedPolyline: null, providerWarnings: [] }];
  assert.equal(candidateMeetsAppointmentWindows({ stops, legs, routeStartAt: "2026-07-26T15:00:00Z" }), false);
  assert.equal(candidateMeetsAppointmentWindows({ stops: [stop("a"), stop("b")], legs, routeStartAt: "2026-07-26T15:00:00Z", workingDayEndAt: "2026-07-26T16:15:00Z" }), false);
});

test("reports only positive provider road savings", () => {
  assert.deepEqual(positiveRoadSavings({ distance: 10000, duration: 1200 }, { distance: 8000, duration: 900 }), { distanceMeters: 2000, durationSeconds: 300 });
  assert.equal(positiveRoadSavings({ distance: 10000, duration: 1200 }, { distance: 11000, duration: 1300 }), null);
});
