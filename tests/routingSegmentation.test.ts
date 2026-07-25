import assert from "node:assert/strict";
import test from "node:test";

import {
  decodePolyline,
  encodePolyline,
  mergeEncodedPolylines,
  splitRouteWaypoints,
} from "../lib/routing/segmentation.ts";

test("large routes split with one shared boundary and no omitted legs", () => {
  const points = Array.from({ length: 60 }, (_, index) => ({
    id: `stop-${index}`, latitude: 33 + index / 100, longitude: -112,
  }));
  const segments = splitRouteWaypoints(points, 27);
  assert.deepEqual(segments.map((segment) => segment.waypoints.length), [27, 27, 8]);
  assert.equal(segments[0].waypoints.at(-1)?.id, segments[1].waypoints[0].id);
  assert.equal(segments[1].waypoints.at(-1)?.id, segments[2].waypoints[0].id);
  assert.equal(segments.reduce((total, segment) => total + segment.waypoints.length - 1, 0), 59);
});

test("encoded segment geometry merges without duplicating its shared point", () => {
  const first = encodePolyline([
    { latitude: 33.1, longitude: -112.1 },
    { latitude: 33.2, longitude: -112.2 },
  ]);
  const second = encodePolyline([
    { latitude: 33.2, longitude: -112.2 },
    { latitude: 33.3, longitude: -112.3 },
  ]);
  assert.deepEqual(decodePolyline(mergeEncodedPolylines([first, second])!), [
    { latitude: 33.1, longitude: -112.1 },
    { latitude: 33.2, longitude: -112.2 },
    { latitude: 33.3, longitude: -112.3 },
  ]);
});
