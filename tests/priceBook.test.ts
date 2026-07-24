import test from "node:test";
import assert from "node:assert/strict";
import { formatCents, marginPercent, parseCurrencyToCents } from "../lib/financial/priceBook.ts";

test("price book currency input converts to exact integer cents", () => {
  assert.equal(parseCurrencyToCents("19.99"), 1999);
  assert.equal(parseCurrencyToCents("10"), 1000);
  assert.equal(parseCurrencyToCents("0.5"), 50);
});

test("price book currency input rejects negatives, excess precision, and unsafe values", () => {
  assert.equal(parseCurrencyToCents("-1.00"), null);
  assert.equal(parseCurrencyToCents("1.001"), null);
  assert.equal(parseCurrencyToCents("999999999999999999"), null);
});

test("margin preview uses price minus internal cost", () => {
  assert.equal(marginPercent(10_000, 6_500), 35);
  assert.equal(marginPercent(0, 0), null);
});

test("cent formatting respects the supplied currency", () => {
  assert.match(formatCents(1234, "USD"), /12\.34/);
});
