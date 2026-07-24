import test from "node:test";
import assert from "node:assert/strict";
import { calculateFinancialDocument } from "../lib/financial/calculations.ts";
import { deriveInvoicePaymentStatus } from "../lib/financial/status.ts";

const line = (overrides: Partial<Parameters<typeof calculateFinancialDocument>[0]["lines"][number]> = {}) => ({
  currency: "USD", quantity: "1", unitPriceCents: 1000, taxable: false, ...overrides,
});

test("quantity multiplied by unit price uses exact four-decimal quantity arithmetic", () => {
  assert.equal(calculateFinancialDocument({ currency: "USD", lines: [line({ quantity: "2.5", unitPriceCents: 199 })] }).subtotalCents, 498);
});

test("multiple line items sum into the subtotal", () => {
  assert.equal(calculateFinancialDocument({ currency: "USD", lines: [line(), line({ unitPriceCents: 250 })] }).subtotalCents, 1250);
});

test("fixed and percentage line discounts are calculated in cents", () => {
  const result = calculateFinancialDocument({ currency: "USD", lines: [
    line({ discount: { type: "fixed", value: 100 } }),
    line({ discount: { type: "percentage", value: 1000 } }),
  ] });
  assert.equal(result.lineDiscountTotalCents, 200);
  assert.equal(result.grandTotalCents, 1800);
});

test("document discount is added to line discounts", () => {
  const result = calculateFinancialDocument({
    currency: "USD",
    lines: [line({ discount: { type: "fixed", value: 100 } })],
    documentDiscount: { type: "percentage", value: 1000 },
  });
  assert.equal(result.discountTotalCents, 190);
});

test("tax applies after discounts only to taxable lines", () => {
  const result = calculateFinancialDocument({
    currency: "USD",
    lines: [
      line({ taxable: true, taxRateBasisPoints: 850 }),
      line({ taxable: false, taxRateBasisPoints: 850 }),
    ],
    documentDiscount: { type: "fixed", value: 200 },
  });
  assert.equal(result.taxTotalCents, 77);
  assert.equal(result.lines[1].taxCents, 0);
});

test("zero tax is supported", () => {
  assert.equal(calculateFinancialDocument({ currency: "USD", lines: [line({ taxable: true })] }).taxTotalCents, 0);
});

test("tax rounds half up per line before document summation", () => {
  const result = calculateFinancialDocument({
    currency: "USD",
    lines: [line({ unitPriceCents: 5, taxable: true, taxRateBasisPoints: 1000 })],
  });
  assert.equal(result.taxTotalCents, 1);
});

test("fees increase the grand total", () => {
  assert.equal(calculateFinancialDocument({ currency: "USD", lines: [line()], feesCents: [100, 250] }).grandTotalCents, 1350);
});

test("fixed and percentage deposits are supported", () => {
  assert.equal(calculateFinancialDocument({ currency: "USD", lines: [line()], deposit: { type: "fixed", value: 300 } }).depositRequiredCents, 300);
  assert.equal(calculateFinancialDocument({ currency: "USD", lines: [line()], deposit: { type: "percentage", value: 2500 } }).depositRequiredCents, 250);
});

test("partial and full payment calculate balance due", () => {
  assert.equal(calculateFinancialDocument({ currency: "USD", lines: [line()], amountPaidCents: 400 }).balanceDueCents, 600);
  assert.equal(calculateFinancialDocument({ currency: "USD", lines: [line()], amountPaidCents: 1000 }).balanceDueCents, 0);
});

test("partial refund reduces net paid and restores balance", () => {
  const result = calculateFinancialDocument({ currency: "USD", lines: [line()], amountPaidCents: 1000, amountRefundedCents: 250 });
  assert.equal(result.netPaidCents, 750);
  assert.equal(result.balanceDueCents, 250);
});

test("full refund restores the balance and derives refunded status", () => {
  const result = calculateFinancialDocument({ currency: "USD", lines: [line()], amountPaidCents: 1000, amountRefundedCents: 1000 });
  assert.equal(result.balanceDueCents, 1000);
  assert.equal(deriveInvoicePaymentStatus({ grandTotalCents: 1000, amountPaidCents: 1000, amountRefundedCents: 1000, currentStatus: "paid", overdue: false }), "refunded");
});

test("currency mismatches are rejected", () => {
  assert.throws(() => calculateFinancialDocument({ currency: "USD", lines: [line({ currency: "CAD" })] }), /document currency/);
});

test("negative and non-integer money inputs are rejected", () => {
  assert.throws(() => calculateFinancialDocument({ currency: "USD", lines: [line({ unitPriceCents: -1 })] }), /non-negative integer/);
  assert.throws(() => calculateFinancialDocument({ currency: "USD", lines: [line({ unitPriceCents: 1.2 })] }), /non-negative integer/);
});

test("refunds greater than captured payments are rejected", () => {
  assert.throws(() => calculateFinancialDocument({ currency: "USD", lines: [line()], amountPaidCents: 100, amountRefundedCents: 101 }), /cannot exceed/);
});

test("very large unsafe totals are rejected", () => {
  assert.throws(() => calculateFinancialDocument({
    currency: "USD",
    lines: [line({ quantity: "999999999999", unitPriceCents: Number.MAX_SAFE_INTEGER })],
  }), /safe integer range/);
});

test("repeated calculations are deterministic", () => {
  const input = {
    currency: "USD",
    lines: [line({ quantity: "3.125", taxable: true, taxRateBasisPoints: 725 })],
    documentDiscount: { type: "percentage" as const, value: 333 },
    feesCents: [99],
  };
  assert.deepEqual(calculateFinancialDocument(input), calculateFinancialDocument(input));
});
