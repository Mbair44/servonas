import assert from "node:assert/strict";
import test from "node:test";

import {
  assertValidComputeRouteInput,
  isValidRouteCoordinates,
  validateDrivingRouteResult,
  type ComputeRouteInput,
} from "../lib/routing/domain.ts";

const input: ComputeRouteInput = {
  origin: { id: "office", latitude: 33.4484, longitude: -112.074 },
  intermediates: [{ id: "job-1", latitude: 33.4152, longitude: -111.8315 }],
  destination: { id: "office-return", latitude: 33.4484, longitude: -112.074 },
  travelMode: "driving",
  departureAt: "2026-07-24T15:00:00.000Z",
};

test("route input accepts valid coordinates and waypoint order", () => {
  assert.doesNotThrow(() => assertValidComputeRouteInput(input));
  assert.equal(isValidRouteCoordinates({ latitude: -90, longitude: 180 }), true);
});

test("route input rejects invalid or duplicate waypoints", () => {
  assert.throws(
    () =>
      assertValidComputeRouteInput({
        ...input,
        destination: { id: "job-1", latitude: 91, longitude: -112.074 },
      }),
    /Duplicate route waypoint ID/,
  );
  assert.equal(isValidRouteCoordinates({ latitude: 0, longitude: 181 }), false);
});

test("route input enforces the provider-neutral waypoint ceiling", () => {
  assert.throws(
    () =>
      assertValidComputeRouteInput({
        ...input,
        intermediates: Array.from({ length: 26 }, (_, index) => ({
          id: `job-${index}`,
          latitude: 33.4,
          longitude: -112,
        })),
      }),
    /more than 25 intermediate waypoints/,
  );
});

test("route input supports future provider travel modes without a domain migration", () => {
  assert.doesNotThrow(() => assertValidComputeRouteInput({ ...input, travelMode: "commercial_vehicle" }));
  assert.doesNotThrow(() => assertValidComputeRouteInput({ ...input, travelMode: "provider_future_mode" }));
  assert.throws(() => assertValidComputeRouteInput({ ...input, travelMode: "" }), /travel mode/);
});

test("driving route results require integer road metrics and every leg", () => {
  assert.doesNotThrow(() =>
    validateDrivingRouteResult(
      {
        provider: "stub",
        providerRequestId: "request-1",
        encodedPolyline: "encoded",
        drivingDistanceMeters: 42_000,
        drivingDurationSeconds: 3_600,
        calculatedAt: "2026-07-24T15:00:01.000Z",
        legs: [
          {
            fromWaypointId: "office",
            toWaypointId: "job-1",
            drivingDistanceMeters: 20_000,
            drivingDurationSeconds: 1_700,
            encodedPolyline: "leg-1",
            providerWarnings: [],
          },
          {
            fromWaypointId: "job-1",
            toWaypointId: "office-return",
            drivingDistanceMeters: 22_000,
            drivingDurationSeconds: 1_900,
            encodedPolyline: "leg-2",
            providerWarnings: [],
          },
        ],
      },
      input,
    ),
  );

  assert.throws(
    () =>
      validateDrivingRouteResult(
        {
          provider: "stub",
          providerRequestId: null,
          encodedPolyline: null,
          drivingDistanceMeters: 1.5,
          drivingDurationSeconds: 10,
          calculatedAt: "2026-07-24T15:00:01.000Z",
          legs: [],
        },
        input,
      ),
    /nonnegative integer/,
  );
});
