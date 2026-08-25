import { calculateFinancialDocument, type Discount, type FinancialDocumentInput, type FinancialLineInput } from "./calculations.ts";

export type TaxCalculationMethod = "manual" | "automatic";
export type TaxDisplayMode = "exclusive" | "inclusive";
export type TaxProviderName = "manual" | "stripe_tax" | "other";

export type BusinessTaxSettings = {
  taxEnabled: boolean;
  calculationMethod: TaxCalculationMethod;
  manualTaxRateBasisPoints: number;
  displayMode: TaxDisplayMode;
  defaultInvoiceItemTaxable: boolean;
};

export type InvoiceTaxCustomer = {
  id: string;
  taxExempt: boolean;
  taxExemptionReference?: string | null;
};

export type PreparedInvoiceTaxContext = {
  settings: BusinessTaxSettings;
  customer: InvoiceTaxCustomer | null;
  provider: TaxProviderName;
  source: "manual_business_rate" | "customer_exempt" | "tax_disabled";
  effectiveTaxRateBasisPoints: number;
};

export type InvoiceTaxSnapshot = {
  taxCalculationMethod: TaxCalculationMethod;
  taxDisplayMode: TaxDisplayMode;
  taxProvider: TaxProviderName;
  taxSource: PreparedInvoiceTaxContext["source"];
  taxJurisdiction: string | null;
  taxableSubtotalCents: number;
  taxSubtotalCents: number;
  taxAmountCents: number;
  taxRateBasisPoints: number;
  taxExemptCustomer: boolean;
  taxExemptionReference: string | null;
  externalTaxCalculationId: string | null;
  taxCalculatedAt: string;
};

export type InvoiceFinancialDocumentResult = ReturnType<typeof calculateFinancialDocument> & {
  taxSnapshot: InvoiceTaxSnapshot;
};

export function resolveInvoiceTaxContext(input: {
  settings: BusinessTaxSettings;
  customer: InvoiceTaxCustomer | null;
}): PreparedInvoiceTaxContext {
  if (!input.settings.taxEnabled) {
    return {
      settings: input.settings,
      customer: input.customer,
      provider: "manual",
      source: "tax_disabled",
      effectiveTaxRateBasisPoints: 0,
    };
  }
  if (input.customer?.taxExempt) {
    return {
      settings: input.settings,
      customer: input.customer,
      provider: "manual",
      source: "customer_exempt",
      effectiveTaxRateBasisPoints: 0,
    };
  }
  return {
    settings: input.settings,
    customer: input.customer,
    provider: "manual",
    source: "manual_business_rate",
    effectiveTaxRateBasisPoints: input.settings.manualTaxRateBasisPoints,
  };
}

export function calculateInvoiceDocumentWithTax(input: {
  currency: string;
  lines: Array<Omit<FinancialLineInput, "taxRateBasisPoints">>;
  documentDiscount?: Discount;
  feesCents?: number[];
  deposit?: Discount;
  amountPaidCents?: number;
  amountRefundedCents?: number;
  taxContext: PreparedInvoiceTaxContext;
  taxCalculatedAt?: string;
}): InvoiceFinancialDocumentResult {
  const documentInput: FinancialDocumentInput = {
    currency: input.currency,
    lines: input.lines.map((line) => ({
      ...line,
      taxRateBasisPoints: line.taxable ? input.taxContext.effectiveTaxRateBasisPoints : 0,
    })),
    documentDiscount: input.documentDiscount,
    feesCents: input.feesCents,
    deposit: input.deposit,
    amountPaidCents: input.amountPaidCents,
    amountRefundedCents: input.amountRefundedCents,
  };
  const totals = calculateFinancialDocument(documentInput);
  const taxableSubtotalCents = totals.lines.reduce((sum, line) => sum + line.taxableAmountCents, 0);
  const taxSnapshot: InvoiceTaxSnapshot = {
    taxCalculationMethod: input.taxContext.settings.calculationMethod,
    taxDisplayMode: input.taxContext.settings.displayMode,
    taxProvider: input.taxContext.provider,
    taxSource: input.taxContext.source,
    taxJurisdiction: null,
    taxableSubtotalCents,
    taxSubtotalCents: taxableSubtotalCents,
    taxAmountCents: totals.taxTotalCents,
    taxRateBasisPoints: input.taxContext.effectiveTaxRateBasisPoints,
    taxExemptCustomer: Boolean(input.taxContext.customer?.taxExempt),
    taxExemptionReference: input.taxContext.customer?.taxExemptionReference ?? null,
    externalTaxCalculationId: null,
    taxCalculatedAt: input.taxCalculatedAt ?? new Date().toISOString(),
  };
  return { ...totals, taxSnapshot };
}
