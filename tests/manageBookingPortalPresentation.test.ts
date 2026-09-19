import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("manage booking uses the bare reservation portal shell", () => {
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/manage-booking/[token]/page.tsx", import.meta.url), "utf8");
  assert.match(middleware, /path\.startsWith\("\/manage-booking\/"\)/);
  assert.match(page, /manage-booking-portal/);
  assert.match(page, /Pay \{money\(booking\.balance_due_cents\)\} now/);
  assert.match(page, /Scheduled payment/);
});
