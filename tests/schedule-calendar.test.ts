import assert from "node:assert/strict";
import test from "node:test";
import { calendarDays, calendarPlacement, startOfCalendarWeek } from "../lib/scheduleCalendar.ts";

test("builds Monday-through-Sunday calendar weeks", () => {
  assert.equal(startOfCalendarWeek("2026-07-23"), "2026-07-20");
  assert.deepEqual(calendarDays("2026-07-23", "week"), [
    "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23",
    "2026-07-24", "2026-07-25", "2026-07-26",
  ]);
  assert.deepEqual(calendarDays("2026-07-23", "day"), ["2026-07-23"]);
});

test("positions jobs in business-local calendar minutes", () => {
  const placement = calendarPlacement(
    "2026-07-23T16:30:00.000Z",
    "2026-07-23T18:00:00.000Z",
    "America/Phoenix",
    7,
    19,
  );
  assert.deepEqual(placement, { top: 150, height: 90 });
});
