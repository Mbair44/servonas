import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("job creation maps a missing scheduled end error to endsAt", async () => {
  const source = await readFile(new URL("../app/app/[businessSlug]/jobs/actions.ts", import.meta.url), "utf8");
  assert.match(source, /if \(startsAt && !endsAt\) errors\.endsAt = timeError;/);
  assert.doesNotMatch(source, /const timeError = validateJobTimes\(startsAt, endsAt, arrivalStart, arrivalEnd\);\s+if \(timeError\) errors\.startsAt = timeError;/);
});
