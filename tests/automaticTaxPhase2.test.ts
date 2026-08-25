import test from "node:test";
import assert from "node:assert/strict";
import { resolveInvoiceTaxContext, calculateInvoiceDocumentWithTax } from "../lib/financial/tax.ts";
import { stripeAutomaticTaxReadiness } from "../lib/financial/stripeTax.ts";
import { resolveInvoiceTaxAddress } from "../lib/financial/invoiceTaxAddress.ts";

const settings = {
  taxEnabled: true,
  calculationMethod: "automatic" as const,
  manualTaxRateBasisPoints: 830,
  displayMode: "exclusive" as const,
  defaultInvoiceItemTaxable: true,
};

test("automatic tax context resolves to provider mode", () => {
  const context = resolveInvoiceTaxContext({ settings, customer: null });
  assert.equal(context.provider, "stripe_tax");
  assert.equal(context.source, "provider");
});

test("stripe automatic tax readiness classifies missing Stripe as unavailable", () => {
  const result = stripeAutomaticTaxReadiness(null);
  assert.equal(result.status, "unavailable_no_stripe");
  assert.equal(result.available, false);
});

test("stripe automatic tax readiness requires completed connected account state", () => {
  const result = stripeAutomaticTaxReadiness({
    provider_account_id: "acct_123",
    onboarding_status: "pending",
    charges_enabled: false,
    payouts_enabled: false,
    capabilities: { card_payments: "pending", transfers: "pending" },
  });
  assert.equal(result.status, "setup_required");
});

test("invoice tax address prefers job service location first", () => {
  const result = resolveInvoiceTaxAddress({
    jobServiceLocation: { street_address: "123 Main", city: "Mesa", state: "AZ", postal_code: "85201", country: "US" },
    invoiceServiceLocation: { street_address: "999 Backup", city: "Gilbert", state: "AZ", postal_code: "85296", country: "US" },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.address.source, "job_service_location");
    assert.equal(result.address.line1, "123 Main");
  }
});

test("invoice tax address fails safely when address is incomplete", () => {
  const result = resolveInvoiceTaxAddress({
    customerBillingAddress: { street_address: "123 Main", city: "Mesa", state: "AZ", postal_code: "", country: "US" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "incomplete_address");
});

test("provider-supplied line tax overrides are used in invoice totals", () => {
  const totals = calculateInvoiceDocumentWithTax({
    currency: "USD",
    taxContext: resolveInvoiceTaxContext({ settings, customer: null }),
    lines: [{ currency: "USD", quantity: "1", unitPriceCents: 10_000, taxable: true }],
    providerLineResults: [{
      taxCents: 777,
      taxRateBasisPoints: 777,
      taxProviderMetadata: { jurisdiction: "AZ" },
      externalTaxCalculationId: "taxcalc_123",
    }],
    externalTaxCalculationId: "taxcalc_123",
    taxJurisdiction: "AZ",
  });
  assert.equal(totals.taxTotalCents, 777);
  assert.equal(totals.grandTotalCents, 10_777);
  assert.equal(totals.taxSnapshot.externalTaxCalculationId, "taxcalc_123");
  assert.equal(totals.taxSnapshot.taxJurisdiction, "AZ");
});
