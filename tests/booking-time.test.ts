import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBusinessDateTime,
  formatBusinessLocalInput,
  zonedDateTimeToUtc,
} from "../lib/bookingTime.ts";

test("converts business-local appointment input to a UTC database instant", () => {
  assert.equal(
    zonedDateTimeToUtc("2026-07-23", "09:30", "America/Phoenix").toISOString(),
    "2026-07-23T16:30:00.000Z",
  );
});

test("round-trips stored UTC timestamps into the business-local form value", () => {
  assert.equal(
    formatBusinessLocalInput("2026-07-23T16:30:00.000Z", "America/Phoenix"),
    "2026-07-23T09:30",
  );
  assert.match(
    formatBusinessDateTime("2026-07-23T16:30:00.000Z", "America/Phoenix"),
    /9:30 AM/,
  );
});
