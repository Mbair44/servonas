import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRouteWarnings, type RouteWarningRoute, type RouteWarningStop } from "../lib/routing/warnings.ts";

const route: RouteWarningRoute = {
  technicianId: "tech-1", technicianName: "Avery", calculationStatus: "ready",
  originType: "office", drivingDistanceMeters: 12000, drivingDurationSeconds: 1800,
};
const stop = (overrides: Partial<RouteWarningStop> = {}): RouteWarningStop => ({
  jobId: "job-1", jobNumber: 1, title: "Repair", technicianId: "tech-1", sequence: 1,
  startsAt: "2026-07-25T15:00:00.000Z", endsAt: "2026-07-25T16:00:00.000Z",
  arrivalWindowStart: null, arrivalWindowEnd: null, plannedArrivalAt: null,
  hasCoordinates: true, hasScheduleConflict: false, inboundDrivingDurationSeconds: 600,
  ...overrides,
});

test("uses verified road duration to identify insufficient travel time", () => {
  const warnings = evaluateRouteWarnings({
    routes: [route],
    stops: [
      stop(),
      stop({ jobId: "job-2", jobNumber: 2, sequence: 2, startsAt: "2026-07-25T16:12:00.000Z", endsAt: "2026-07-25T17:00:00.000Z", inboundDrivingDurationSeconds: 1440 }),
    ],
  });
  const risk = warnings.find((item) => item.code === "insufficient_travel_time");
  assert.ok(risk);
  assert.match(risk.message, /12 minutes between jobs/);
  assert.match(risk.message, /24 minutes/);
});

test("does not claim insufficient travel time without road duration", () => {
  const warnings = evaluateRouteWarnings({
    routes: [route],
    stops: [stop(), stop({ jobId: "job-2", sequence: 2, startsAt: "2026-07-25T16:05:00.000Z", inboundDrivingDurationSeconds: null })],
  });
  assert.equal(warnings.some((item) => item.code === "insufficient_travel_time"), false);
});

test("flags a calculated ETA after the appointment window", () => {
  const warnings = evaluateRouteWarnings({
    routes: [route],
    stops: [stop({ arrivalWindowEnd: "2026-07-25T15:30:00.000Z", plannedArrivalAt: "2026-07-25T15:45:00.000Z" })],
  });
  assert.equal(warnings.find((item) => item.code === "appointment_window_risk")?.severity, "critical");
});

test("labels partial road data as uncertain", () => {
  const warnings = evaluateRouteWarnings({ routes: [{ ...route, calculationStatus: "partial" }], stops: [stop()] });
  assert.match(warnings.find((item) => item.code === "route_partial")?.message ?? "", /uncertain/);
});

test("centralizes missing coordinates, overlap, and unassigned warnings", () => {
  const warnings = evaluateRouteWarnings({
    routes: [],
    stops: [stop({ technicianId: null, hasCoordinates: false, hasScheduleConflict: true })],
  });
  assert.deepEqual(
    new Set(warnings.map((item) => item.code)),
    new Set(["unassigned_job", "missing_coordinates", "overlapping_jobs"]),
  );
});
