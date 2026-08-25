import test from "node:test";
import assert from "node:assert/strict";
import { calculateInvoiceDocumentWithTax, resolveInvoiceTaxContext } from "../lib/financial/tax.ts";

const settings = {
  taxEnabled: true,
  calculationMethod: "manual" as const,
  manualTaxRateBasisPoints: 830,
  displayMode: "exclusive" as const,
  defaultInvoiceItemTaxable: true,
};

test("tax disabled leaves invoice totals unchanged", () => {
  const result = calculateInvoiceDocumentWithTax({
    currency: "USD",
    taxContext: resolveInvoiceTaxContext({ settings: { ...settings, taxEnabled: false }, customer: null }),
    lines: [{ currency: "USD", quantity: "1", unitPriceCents: 15_000, taxable: true }],
  });
  assert.equal(result.taxTotalCents, 0);
  assert.equal(result.grandTotalCents, 15_000);
  assert.equal(result.taxSnapshot.taxSource, "tax_disabled");
});

test("manual tax applies only to taxable items", () => {
  const result = calculateInvoiceDocumentWithTax({
    currency: "USD",
    taxContext: resolveInvoiceTaxContext({ settings, customer: null }),
    lines: [
      { currency: "USD", quantity: "1", unitPriceCents: 15_000, taxable: true },
      { currency: "USD", quantity: "1", unitPriceCents: 5_000, taxable: false },
    ],
  });
  assert.equal(result.taxSnapshot.taxableSubtotalCents, 15_000);
  assert.equal(result.taxTotalCents, 1_245);
  assert.equal(result.grandTotalCents, 21_245);
});

test("tax-exempt customer overrides taxable lines", () => {
  const result = calculateInvoiceDocumentWithTax({
    currency: "USD",
    taxContext: resolveInvoiceTaxContext({
      settings,
      customer: { id: "cust_1", taxExempt: true, taxExemptionReference: "CERT-42" },
    }),
    lines: [{ currency: "USD", quantity: "1", unitPriceCents: 15_000, taxable: true }],
  });
  assert.equal(result.taxTotalCents, 0);
  assert.equal(result.taxSnapshot.taxExemptCustomer, true);
  assert.equal(result.taxSnapshot.taxExemptionReference, "CERT-42");
  assert.equal(result.taxSnapshot.taxSource, "customer_exempt");
});

test("manual tax rounds in cents and snapshots the rate", () => {
  const result = calculateInvoiceDocumentWithTax({
    currency: "USD",
    taxContext: resolveInvoiceTaxContext({
      settings: { ...settings, manualTaxRateBasisPoints: 1000 },
      customer: null,
    }),
    lines: [{ currency: "USD", quantity: "1", unitPriceCents: 5, taxable: true }],
  });
  assert.equal(result.taxTotalCents, 1);
  assert.equal(result.taxSnapshot.taxRateBasisPoints, 1000);
});

test("invoice tax calculations are deterministic for snapshot stability", () => {
  const input = {
    currency: "USD",
    taxContext: resolveInvoiceTaxContext({ settings, customer: null }),
    lines: [{ currency: "USD", quantity: "3.125", unitPriceCents: 725, taxable: true }],
    feesCents: [99],
  };
  assert.deepEqual(calculateInvoiceDocumentWithTax(input), calculateInvoiceDocumentWithTax(input));
});
