export type InvoiceTaxAddressSource =
  | "job_service_location"
  | "invoice_service_location"
  | "customer_billing_address";

export type InvoiceTaxAddressRecord = {
  street_address?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

export type InvoiceTaxAddress = {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  source: InvoiceTaxAddressSource;
  snapshot: {
    source: InvoiceTaxAddressSource;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
};

export type InvoiceTaxAddressResolution =
  | { ok: true; address: InvoiceTaxAddress }
  | { ok: false; code: "missing_address" | "incomplete_address"; message: string };

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

function normalizeAddress(source: InvoiceTaxAddressSource, record: InvoiceTaxAddressRecord | null | undefined): InvoiceTaxAddressResolution {
  if (!record) {
    return { ok: false, code: "missing_address", message: "Automatic tax requires a service or billing address." };
  }
  const line1 = clean(record.street_address);
  const line2 = clean(record.unit) || null;
  const city = clean(record.city);
  const state = clean(record.state).toUpperCase();
  const postalCode = clean(record.postal_code);
  const country = clean(record.country).toUpperCase() || "US";
  if (!line1 || !city || !state || !postalCode || !country) {
    return {
      ok: false,
      code: "incomplete_address",
      message: "Automatic tax couldn't be calculated. Complete the service address or switch this invoice to manual tax.",
    };
  }
  return {
    ok: true,
    address: {
      line1,
      line2,
      city,
      state,
      postalCode,
      country,
      source,
      snapshot: { source, line1, line2, city, state, postalCode, country },
    },
  };
}

export function resolveInvoiceTaxAddress(input: {
  jobServiceLocation?: InvoiceTaxAddressRecord | null;
  invoiceServiceLocation?: InvoiceTaxAddressRecord | null;
  customerBillingAddress?: InvoiceTaxAddressRecord | null;
}): InvoiceTaxAddressResolution {
  const attempts: Array<[InvoiceTaxAddressSource, InvoiceTaxAddressRecord | null | undefined]> = [
    ["job_service_location", input.jobServiceLocation],
    ["invoice_service_location", input.invoiceServiceLocation],
    ["customer_billing_address", input.customerBillingAddress],
  ];
  let incomplete: InvoiceTaxAddressResolution | null = null;
  for (const [source, record] of attempts) {
    const result = normalizeAddress(source, record);
    if (result.ok) return result;
    if (result.code === "incomplete_address") incomplete = result;
  }
  return incomplete ?? { ok: false, code: "missing_address", message: "Automatic tax requires a service or billing address." };
}
