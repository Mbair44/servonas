import assert from "node:assert/strict";
import test from "node:test";
import { nonNegativeMoney, validateJobTimes } from "../lib/jobValidation.ts";

test("rejects invalid job and arrival-window ordering", () => {
  const start = new Date("2026-08-01T10:00:00Z");
  assert.match(validateJobTimes(start, null, null, null) ?? "", /both required/);
  assert.match(validateJobTimes(start, new Date("2026-08-01T09:00:00Z"), null, null) ?? "", /after/);
  assert.match(validateJobTimes(start, new Date("2026-08-01T11:00:00Z"), start, new Date("2026-08-01T09:00:00Z")) ?? "", /Arrival/);
});

test("accepts valid job times and non-negative money", () => {
  assert.equal(validateJobTimes(new Date("2026-08-01T10:00:00Z"), new Date("2026-08-01T11:00:00Z"), null, null), null);
  assert.equal(nonNegativeMoney("12.50"), 12.5);
  assert.equal(nonNegativeMoney("-1"), null);
});
