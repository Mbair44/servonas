import assert from "node:assert/strict";
import test from "node:test";
import { actualRouteImpactSummary } from "../lib/routing/impact.ts";

test("reports actual per-technician and net road impact", () => {
  const result = actualRouteImpactSummary([
    { technicianName: "Mike", before: { drivingDistanceMeters: 20000, drivingDurationSeconds: 3000 }, after: { drivingDistanceMeters: 10000, drivingDurationSeconds: 1800 } },
    { technicianName: "Sarah", before: { drivingDistanceMeters: 5000, drivingDurationSeconds: 900 }, after: { drivingDistanceMeters: 9000, drivingDurationSeconds: 1500 } },
  ]);
  assert.match(result ?? "", /Mike: 6\.2 fewer driving miles/);
  assert.match(result ?? "", /Sarah: 2\.5 additional driving miles/);
  assert.match(result ?? "", /Net: 3\.7 fewer driving miles, 10 fewer driving minutes/);
});

test("does not claim impact when either route lacks comparable road metrics", () => {
  assert.equal(actualRouteImpactSummary([
    { technicianName: "Mike", before: null, after: { drivingDistanceMeters: 1000, drivingDurationSeconds: 60 } },
  ]), null);
});
