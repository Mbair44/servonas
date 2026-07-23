import assert from "node:assert/strict";
import test from "node:test";
import { conflictingJobNumbers, effectiveJobWindow, intervalsOverlap, technicianWorksDuring } from "../lib/schedulingRules.ts";

test("detects overlap using scheduled and arrival windows", () => {
  const window = effectiveJobWindow({
    starts_at: "2026-08-10T16:00:00Z",
    ends_at: "2026-08-10T17:00:00Z",
    arrival_window_start: "2026-08-10T15:30:00Z",
    arrival_window_end: "2026-08-10T16:30:00Z",
  });
  assert.deepEqual(window, {
    starts_at: "2026-08-10T15:30:00.000Z",
    ends_at: "2026-08-10T17:00:00.000Z",
  });
  assert.equal(intervalsOverlap(
    new Date("2026-08-10T15:45:00Z"),
    new Date("2026-08-10T16:15:00Z"),
    window!,
  ), true);
});

test("cancelled jobs can be excluded before reusable conflict evaluation", () => {
  const activeJobs = [
    { job_number: "1002", starts_at: "2026-08-10T16:30:00Z", ends_at: "2026-08-10T17:30:00Z" },
  ];
  assert.deepEqual(conflictingJobNumbers(
    new Date("2026-08-10T16:00:00Z"),
    new Date("2026-08-10T17:00:00Z"),
    activeJobs,
  ), ["1002"]);
  assert.deepEqual(conflictingJobNumbers(
    new Date("2026-08-10T16:00:00Z"),
    new Date("2026-08-10T17:00:00Z"),
    [],
  ), []);
});

test("technician hours support inherited, numeric, and named-day schedules", () => {
  assert.equal(technicianWorksDuring({}, 1, "09:00", "10:00"), true);
  assert.equal(technicianWorksDuring({ "1": { start: "08:00", end: "17:00" } }, 1, "09:00", "10:00"), true);
  assert.equal(technicianWorksDuring({ monday: { start_time: "08:00", end_time: "17:00" } }, 1, "07:30", "10:00"), false);
  assert.equal(technicianWorksDuring({ monday: { active: false, start: "08:00", end: "17:00" } }, 1, "09:00", "10:00"), false);
});
