import assert from "node:assert/strict";
import test from "node:test";
import { conflictingDispatchJobIds, dispatchTechnicianState } from "../lib/dispatchBoard.ts";
import { availableJobTransitions, canTransitionJob } from "../lib/jobStatusTransitions.ts";

test("detects overlapping jobs assigned to the same technician only", () => {
  const conflicts = conflictingDispatchJobIds([
    { id: "a", assigned_technician_id: "tech-1", starts_at: "2026-07-23T16:00:00Z", ends_at: "2026-07-23T17:00:00Z" },
    { id: "b", assigned_technician_id: "tech-1", starts_at: "2026-07-23T16:30:00Z", ends_at: "2026-07-23T17:30:00Z" },
    { id: "c", assigned_technician_id: "tech-2", starts_at: "2026-07-23T16:30:00Z", ends_at: "2026-07-23T17:30:00Z" },
  ]);
  assert.deepEqual([...conflicts].sort(), ["a", "b"]);
});

test("derives technician dispatch state from active work", () => {
  assert.equal(dispatchTechnicianState("available", ["scheduled"]), "assigned");
  assert.equal(dispatchTechnicianState("available", ["en_route"]), "en_route");
  assert.equal(dispatchTechnicianState("available", ["in_progress"]), "on_site");
  assert.equal(dispatchTechnicianState("off_duty", ["in_progress"]), "off_duty");
});

test("rejects invalid backwards job-status transitions", () => {
  assert.equal(canTransitionJob("scheduled", "dispatched"), true);
  assert.equal(canTransitionJob("en_route", "arrived"), true);
  assert.equal(canTransitionJob("completed", "en_route"), false);
  assert.deepEqual(availableJobTransitions("completed"), []);
});
