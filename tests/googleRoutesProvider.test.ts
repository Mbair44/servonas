import assert from "node:assert/strict";
import test from "node:test";

import { GoogleRoutesProvider } from "../lib/routing/googleRoutesProvider.ts";

test("Google Routes provider maps authoritative road legs and encoded geometry", async () => {
  const originalFetch = globalThis.fetch;
  let apiKeyHeader: string | null = null;
  globalThis.fetch = (async (_input, init) => {
    apiKeyHeader = new Headers(init?.headers).get("X-Goog-Api-Key");
    return new Response(JSON.stringify({
      routes: [{
        distanceMeters: 3218,
        duration: "420s",
        polyline: { encodedPolyline: "whole-route" },
        legs: [{
          distanceMeters: 3218,
          duration: "420s",
          polyline: { encodedPolyline: "road-leg" },
        }],
      }],
    }), { status: 200, headers: { "x-request-id": "route-request" } });
  }) as typeof fetch;
  try {
    const provider = new GoogleRoutesProvider("server-secret");
    const result = await provider.computeRoute({
      origin: { id: "one", latitude: 33.4, longitude: -112.1 },
      intermediates: [],
      destination: { id: "two", latitude: 33.5, longitude: -112 },
      travelMode: "driving",
    });
    assert.equal(result.drivingDistanceMeters, 3218);
    assert.equal(result.drivingDurationSeconds, 420);
    assert.equal(result.encodedPolyline, "whole-route");
    assert.equal(result.legs[0].encodedPolyline, "road-leg");
    assert.equal(apiKeyHeader, "server-secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google Routes provider reports provider HTTP failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{"error":{"message":"quota exceeded"}}', { status: 429 })) as typeof fetch;
  try {
    await assert.rejects(
      () => new GoogleRoutesProvider("server-secret").computeRoute({
        origin: { id: "one", latitude: 33.4, longitude: -112.1 },
        intermediates: [],
        destination: { id: "two", latitude: 33.5, longitude: -112 },
        travelMode: "driving",
      }),
      /Google Routes request failed \(429\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
