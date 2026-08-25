import { stripeClient, stripePaymentsReady } from "../stripeConnect.ts";
import type { BusinessTaxSettings, InvoiceTaxCustomer, InvoiceTaxSnapshot, TaxProviderName } from "./tax.ts";
import type { InvoiceTaxAddress } from "./invoiceTaxAddress.ts";
import { calculateInvoiceDocumentWithTax } from "./tax.ts";
import type { Discount } from "./calculations.ts";

export type AutomaticTaxReadinessStatus =
  | "unavailable_no_stripe"
  | "setup_required"
  | "ready"
  | "provider_error";

export type AutomaticTaxReadiness = {
  status: AutomaticTaxReadinessStatus;
  available: boolean;
  message: string;
};

type PaymentAccountForTax = {
  provider_account_id?: string | null;
  onboarding_status?: string | null;
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  capabilities?: Record<string, string> | null;
  last_provider_error?: string | null;
};

export function stripeAutomaticTaxReadiness(account: PaymentAccountForTax | null | undefined): AutomaticTaxReadiness {
  if (!account?.provider_account_id) {
    return { status: "unavailable_no_stripe", available: false, message: "Connect Stripe to use automatic sales tax." };
  }
  if (account.last_provider_error) {
    return { status: "provider_error", available: false, message: "Stripe Tax is temporarily unavailable. Refresh Stripe status or try again." };
  }
  const cardPaymentsCapability = account.capabilities?.card_payments ?? null;
  const transfersCapability = account.capabilities?.transfers ?? null;
  const readyForPayments = stripePaymentsReady(account);
  const capabilityReady = (!cardPaymentsCapability || cardPaymentsCapability === "active")
    && (!transfersCapability || transfersCapability === "active");
  if (readyForPayments && capabilityReady) {
    return { status: "ready", available: true, message: "Automatic sales tax is ready." };
  }
  return { status: "setup_required", available: false, message: "Stripe Tax setup required." };
}

export class InvoiceAutomaticTaxError extends Error {
  code: "provider_unavailable" | "provider_request_failed" | "address_invalid";
  retryable: boolean;

  constructor(code: InvoiceAutomaticTaxError["code"], message: string, retryable = false) {
    super(message);
    this.name = "InvoiceAutomaticTaxError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type StripeTaxLineResult = {
  taxCents: number;
  taxRateBasisPoints: number;
  taxProviderMetadata: Record<string, unknown>;
  externalTaxCalculationId: string | null;
};

export async function calculateStripeTaxForInvoice(input: {
  stripeAccountId: string;
  address: InvoiceTaxAddress;
  customer: InvoiceTaxCustomer | null;
  settings: BusinessTaxSettings;
  currency: string;
  lines: Array<{
    id?: string;
    name: string;
    quantity: string;
    unitPriceCents: number;
    taxable: boolean;
    taxCode?: string | null;
    discount?: Discount;
  }>;
  feesCents?: number[];
  documentDiscount?: Discount;
  deposit?: Discount;
  amountPaidCents?: number;
  amountRefundedCents?: number;
}): Promise<{
  totals: ReturnType<typeof calculateInvoiceDocumentWithTax>;
  lineResults: StripeTaxLineResult[];
  taxSnapshot: InvoiceTaxSnapshot;
}> {
  const taxableLines = input.lines.filter((line) => line.taxable);
  if (!taxableLines.length) {
    const totals = calculateInvoiceDocumentWithTax({
      currency: input.currency,
      lines: input.lines.map((line) => ({
        currency: input.currency,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        taxable: line.taxable,
        discount: line.discount,
      })),
      documentDiscount: input.documentDiscount,
      feesCents: input.feesCents,
      deposit: input.deposit,
      amountPaidCents: input.amountPaidCents,
      amountRefundedCents: input.amountRefundedCents,
      taxContext: {
        settings: input.settings,
        customer: input.customer,
        provider: "stripe_tax" satisfies TaxProviderName,
        source: "provider",
        effectiveTaxRateBasisPoints: 0,
      },
      providerMetadata: { address_source: input.address.source, no_taxable_lines: true },
      taxSourceAddressSnapshot: input.address.snapshot,
      providerLineResults: input.lines.map(() => ({
        taxCents: 0,
        taxRateBasisPoints: 0,
        taxProviderMetadata: {},
        externalTaxCalculationId: null,
      })),
    });
    return {
      totals,
      lineResults: input.lines.map(() => ({
        taxCents: 0,
        taxRateBasisPoints: 0,
        taxProviderMetadata: {},
        externalTaxCalculationId: null,
      })),
      taxSnapshot: totals.taxSnapshot,
    };
  }
  const stripe = stripeClient() as any;
  let calculation: any;
  try {
    calculation = await stripe.tax.calculations.create({
      currency: input.currency.toLowerCase(),
      line_items: taxableLines.map((line, index) => ({
        amount: Math.round(line.unitPriceCents * Math.max(1, Number(line.quantity || "1"))),
        reference: line.id ?? `line_${index + 1}`,
        tax_behavior: input.settings.displayMode,
        tax_code: line.taxCode?.trim() || undefined,
      })),
      customer_details: {
        address: {
          line1: input.address.line1,
          line2: input.address.line2 ?? undefined,
          city: input.address.city,
          state: input.address.state,
          postal_code: input.address.postalCode,
          country: input.address.country,
        },
        address_source: "shipping",
        taxability_override: input.customer?.taxExempt ? "exempt" : "none",
      },
    }, { stripeAccount: input.stripeAccountId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe Tax error";
    throw new InvoiceAutomaticTaxError("provider_request_failed", "Automatic tax couldn't be calculated right now. Please try again or switch this invoice to manual tax.", true);
  }
  const lineItems: any[] = Array.isArray(calculation?.line_items?.data)
    ? calculation.line_items.data
    : Array.isArray(calculation?.line_items)
      ? calculation.line_items
      : [];
  const lineResultMap = new Map<string, StripeTaxLineResult>();
  for (const line of lineItems) {
    const reference = typeof line?.reference === "string" ? line.reference : null;
    if (!reference) continue;
    const taxableAmount = Number(line.amount ?? 0);
    const taxAmount = Number(line.amount_tax ?? 0);
    const effectiveRate = taxableAmount > 0 ? Math.round((taxAmount / taxableAmount) * 10_000) : 0;
    lineResultMap.set(reference, {
      taxCents: Number.isFinite(taxAmount) ? taxAmount : 0,
      taxRateBasisPoints: effectiveRate,
      taxProviderMetadata: {
        taxability_reason: line.taxability_reason ?? null,
        tax_breakdown: Array.isArray(line.tax_breakdown) ? line.tax_breakdown : [],
      },
      externalTaxCalculationId: calculation?.id ?? null,
    });
  }
  const lineResults = input.lines.map((line, index) => line.taxable
    ? lineResultMap.get(line.id ?? `line_${index + 1}`) ?? {
        taxCents: 0,
        taxRateBasisPoints: 0,
        taxProviderMetadata: {},
        externalTaxCalculationId: calculation?.id ?? null,
      }
    : {
        taxCents: 0,
        taxRateBasisPoints: 0,
        taxProviderMetadata: {},
        externalTaxCalculationId: calculation?.id ?? null,
      });
  const totals = calculateInvoiceDocumentWithTax({
    currency: input.currency,
    lines: input.lines.map((line, index) => ({
      currency: input.currency,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      taxable: line.taxable,
      taxCentsOverride: lineResults[index]?.taxCents ?? 0,
      discount: line.discount,
    })),
    documentDiscount: input.documentDiscount,
    feesCents: input.feesCents,
    deposit: input.deposit,
    amountPaidCents: input.amountPaidCents,
    amountRefundedCents: input.amountRefundedCents,
    taxContext: {
      settings: input.settings,
      customer: input.customer,
      provider: "stripe_tax" satisfies TaxProviderName,
      source: "provider",
      effectiveTaxRateBasisPoints: Number(calculation?.tax_amount_exclusive ?? 0) > 0 && Number(calculation?.amount_total ?? 0) > 0
        ? Math.round((Number(calculation.tax_amount_exclusive) / Math.max(1, Number(calculation.amount_total) - Number(calculation.tax_amount_exclusive))) * 10_000)
        : 0,
    },
    providerMetadata: {
      tax_provider_calculation_id: calculation?.id ?? null,
      address_source: input.address.source,
      tax_breakdown: Array.isArray(calculation?.tax_breakdown) ? calculation.tax_breakdown : [],
    },
    taxJurisdiction: typeof calculation?.tax_breakdown?.[0]?.jurisdiction === "string" ? calculation.tax_breakdown[0].jurisdiction : null,
    externalTaxCalculationId: calculation?.id ?? null,
    taxSourceAddressSnapshot: input.address.snapshot,
    providerLineResults: lineResults,
  });
  return { totals, lineResults, taxSnapshot: totals.taxSnapshot };
}
