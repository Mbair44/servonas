import assert from "node:assert/strict";
import test from "node:test";
import { availableJobTransitions, canTransitionJob } from "../lib/jobStatusTransitions.ts";

test("technician field progression follows dispatch through completion", () => {
  assert.equal(canTransitionJob("dispatched", "en_route"), true);
  assert.equal(canTransitionJob("en_route", "arrived"), true);
  assert.equal(canTransitionJob("arrived", "in_progress"), true);
  assert.equal(canTransitionJob("in_progress", "completed"), true);
});

test("terminal jobs cannot return to active technician states", () => {
  assert.deepEqual(availableJobTransitions("completed"), []);
  assert.equal(canTransitionJob("completed", "en_route"), false);
  assert.equal(canTransitionJob("canceled", "in_progress"), false);
});
