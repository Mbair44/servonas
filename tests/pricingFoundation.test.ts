import assert from "node:assert/strict";
import test from "node:test";
import { PLATFORM_FEE_MONTHLY_CAP_CENTS, percentageFeeCents, platformFeeCents } from "../lib/pricing/catalog.ts";

test("platform fees use deterministic integer half-up rounding", () => {
  assert.equal(percentageFeeCents(1), 0);
  assert.equal(percentageFeeCents(17), 1);
  assert.equal(percentageFeeCents(10_001), 300);
});

test("platform fees never exceed the remaining monthly cap", () => {
  assert.equal(platformFeeCents(1_000_000, PLATFORM_FEE_MONTHLY_CAP_CENTS), PLATFORM_FEE_MONTHLY_CAP_CENTS);
  assert.equal(platformFeeCents(10_000, 17), 17);
  assert.throws(() => platformFeeCents(-1, 10));
});
