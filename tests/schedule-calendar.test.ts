import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calendarDays, calendarPlacement, shiftCalendarMonth, startOfCalendarWeek } from "../lib/scheduleCalendar.ts";

test("builds Monday-through-Sunday calendar weeks", () => {
  assert.equal(startOfCalendarWeek("2026-07-23"), "2026-07-20");
  assert.deepEqual(calendarDays("2026-07-23", "week"), [
    "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23",
    "2026-07-24", "2026-07-25", "2026-07-26",
  ]);
  assert.deepEqual(calendarDays("2026-07-23", "day"), ["2026-07-23"]);
});

test("builds a complete month grid including adjacent-month days", () => {
  const days = calendarDays("2026-09-15", "month");
  assert.equal(days[0], "2026-08-31");
  assert.equal(days.at(-1), "2026-10-04");
  assert.equal(days.length, 35);
  assert.equal(shiftCalendarMonth("2026-01-31", -1), "2025-12-01");
  assert.equal(shiftCalendarMonth("2026-12-15", 1), "2027-01-01");
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

test("month schedule keeps compact jobs and opens the full day for overflow", async () => {
  const page = await readFile(new URL("../app/app/[businessSlug]/schedule/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\["day", "week", "month"\]/);
  assert.match(page, /dayJobs\.slice\(0, 2\)/);
  assert.match(page, /dayJobs\.length - 2/);
  assert.match(page, /paramsCopy\.set\("view", "day"\)/);
});
