import test from "node:test";
import assert from "node:assert/strict";
import { canSendProximityEta, etaRangeMinutes } from "../lib/routing/etaNotifications.ts";
import { routeMetrics } from "../lib/routing/metrics.ts";

test("proximity ETA requires every confidence signal", () => {
  const complete = {
    technicianEnRoute: true, priorStopCompleted: true, routeCalculationCurrent: true,
    providerDrivingDurationSeconds: 901, confidence: "high" as const,
  };
  assert.equal(canSendProximityEta(complete), true);
  assert.equal(canSendProximityEta({ ...complete, priorStopCompleted: false }), false);
  assert.equal(canSendProximityEta({ ...complete, confidence: "medium" }), false);
  assert.equal(canSendProximityEta({ ...complete, providerDrivingDurationSeconds: null }), false);
  assert.deepEqual(etaRangeMinutes(901), { lower: 15, upper: 25 });
});

test("route metrics exclude failed route values and remain provider-estimate based", () => {
  const metrics = routeMetrics({
    totalJobs: 5, assignedJobs: 4, jobsAtRisk: 1, stopsMissingCoordinates: 1,
    routes: [
      { calculationStatus: "ready", drivingDistanceMeters: 1609, drivingDurationSeconds: 600, stopCount: 3, serviceDurationSeconds: 3600, warningCount: 0 },
      { calculationStatus: "failed", drivingDistanceMeters: 999999, drivingDurationSeconds: 999999, stopCount: 2, serviceDurationSeconds: 1800, warningCount: 0 },
    ],
  });
  assert.equal(metrics.unassignedJobs, 1);
  assert.equal(metrics.drivingDistanceMeters, 1609);
  assert.equal(metrics.averageDriveSeconds, 300);
  assert.equal(metrics.routesWithWarnings, 1);
});
