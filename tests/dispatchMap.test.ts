import assert from "node:assert/strict";
import test from "node:test";

import { routableLocationCoordinates, scheduledStopSequence } from "../lib/dispatchMap.ts";

test("dispatch map uses only currently trusted location coordinates", () => {
  assert.deepEqual(
    routableLocationCoordinates({ geocodingStatus: "verified", latitude: "33.45", longitude: "-112.07" }),
    { latitude: 33.45, longitude: -112.07 },
  );
  assert.deepEqual(
    routableLocationCoordinates({ geocodingStatus: "manual", latitude: 0, longitude: -112.07 }),
    { latitude: 0, longitude: -112.07 },
  );
  assert.equal(
    routableLocationCoordinates({ geocodingStatus: "stale", latitude: 33.45, longitude: -112.07 }),
    null,
  );
  assert.equal(
    routableLocationCoordinates({ geocodingStatus: "verified", latitude: 0, longitude: 0 }),
    null,
  );
});

test("dispatch map stop numbers follow each technician's scheduled order", () => {
  const sequence = scheduledStopSequence(
    [
      { id: "a", assignedTechnicianId: "tech-1" },
      { id: "b", assignedTechnicianId: "tech-2" },
      { id: "c", assignedTechnicianId: "tech-1" },
      { id: "u", assignedTechnicianId: null },
    ],
    ["tech-1", "tech-2"],
  );
  assert.equal(sequence.get("a"), 1);
  assert.equal(sequence.get("c"), 2);
  assert.equal(sequence.get("b"), 1);
  assert.equal(sequence.has("u"), false);
});

