"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { EstimateActionState, EstimateFeeDraft, EstimateLineDraft } from "@/app/app/[businessSlug]/estimates/actions";
import { type Discount } from "@/lib/financial/calculations";
import { calculateFinancialDocument } from "@/lib/financial/calculations";
import { formatCents, parseCurrencyToCents, priceBookUnitTypes } from "@/lib/financial/priceBook";
import { calculateInvoiceDocumentWithTax, resolveInvoiceTaxContext, type BusinessTaxSettings, type InvoiceFinancialDocumentResult } from "@/lib/financial/tax";
import { ManagementDrawer } from "./ManagementDrawer";

type Customer = {
  id: string;
  first_name: string;
  last_name: string;
  company_name?: string | null;
  tax_exempt?: boolean | null;
  tax_exemption_reference?: string | null;
};
type Location = { id: string; customer_id: string; location_name: string; street_address: string };
type Job = { id: string; customer_id: string; job_number: number; title: string };
type PriceItem = {
  id: string;
  name: string;
  description?: string | null;
  unit_type: string;
  default_unit_price_cents: number;
  internal_cost_cents: number;
  is_taxable: boolean;
  service_id?: string | null;
  tax_code?: string | null;
};
type TaxRate = { id: string; name: string; rate_basis_points: number; is_default: boolean };
type Estimate = Record<string, string | number | boolean | null | undefined>;

const blankLine = (defaultTaxable = true): EstimateLineDraft => ({
  name: "",
  quantity: "1",
  unitType: "each",
  unitPrice: "0.00",
  internalCost: "0.00",
  discountType: "none",
  discountValue: "0",
  taxable: defaultTaxable,
});

function lineDiscount(line: EstimateLineDraft): Discount {
  if (line.discountType === "fixed") return { type: "fixed", value: parseCurrencyToCents(line.discountValue) ?? 0 };
  if (line.discountType === "percentage") return { type: "percentage", value: Math.round(Number(line.discountValue) * 100) };
  return { type: "none", value: 0 };
}

function customerLabel(customer: Customer) {
  return customer.company_name || `${customer.first_name} ${customer.last_name}`.trim();
}

function currencyInputValue(value: string) {
  return value === "0" || value === "0.00" ? "" : value;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatPhoneNumber(value: string) {
  const digits = digitsOnly(value).slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function lineSettingBadges(line: EstimateLineDraft, taxEnabled: boolean) {
  const badges: string[] = [];
  if (line.discountType === "percentage" && Number(line.discountValue) > 0) badges.push(`${line.discountValue}% discount`);
  if (line.discountType === "fixed" && (parseCurrencyToCents(line.discountValue) ?? 0) > 0) {
    badges.push(`${formatCents(parseCurrencyToCents(line.discountValue) ?? 0)} off`);
  }
  if (taxEnabled && !line.taxable) badges.push("Tax exempt");
  if (line.unitType && line.unitType !== "each") badges.push(line.unitType.replaceAll("_", " "));
  return badges;
}

export default function EstimateForm({
  action,
  customers,
  locations,
  jobs,
  priceItems,
  taxRates: _taxRates = [],
  estimate,
  initialLines = [],
  initialFees = [],
  submitLabel,
  documentType = "estimate",
  newDocument = false,
  businessTaxSettings,
  onlinePaymentsReady = true,
}: {
  action: (state: EstimateActionState, data: FormData) => Promise<EstimateActionState>;
  customers: Customer[];
  locations: Location[];
  jobs: Job[];
  priceItems: PriceItem[];
  taxRates?: TaxRate[];
  estimate?: Estimate;
  initialLines?: EstimateLineDraft[];
  initialFees?: EstimateFeeDraft[];
  submitLabel: string;
  documentType?: "estimate" | "invoice";
  newDocument?: boolean;
  businessTaxSettings?: BusinessTaxSettings;
  onlinePaymentsReady?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  void _taxRates;
  const isInvoice = documentType === "invoice";
  const manualCustomerOption = "__manual_customer__";
  const requestKey = useRef(typeof crypto === "undefined" ? "" : crypto.randomUUID());
  const [customerId, setCustomerId] = useState(String(state.values?.customerId ?? estimate?.customer_id ?? ""));
  const [manualCustomerDrawerOpen, setManualCustomerDrawerOpen] = useState(false);
  const [manualCustomerFirstName, setManualCustomerFirstName] = useState(String(state.values?.manualCustomerFirstName ?? ""));
  const [manualCustomerLastName, setManualCustomerLastName] = useState(String(state.values?.manualCustomerLastName ?? ""));
  const [manualCustomerCompanyName, setManualCustomerCompanyName] = useState(String(state.values?.manualCustomerCompanyName ?? ""));
  const [manualCustomerEmail, setManualCustomerEmail] = useState(String(state.values?.manualCustomerEmail ?? ""));
  const [manualCustomerPhone, setManualCustomerPhone] = useState(String(state.values?.manualCustomerPhone ?? ""));
  const [lines, setLines] = useState(initialLines.length ? initialLines : [blankLine(businessTaxSettings?.defaultInvoiceItemTaxable ?? true)]);
  const [fees, setFees] = useState(initialFees);
  const [discountType, setDiscountType] = useState(String(estimate?.document_discount_type ?? "none"));
  const [discountValue, setDiscountValue] = useState(
    discountType === "fixed"
      ? (Number(estimate?.document_discount_value ?? 0) / 100).toFixed(2)
      : discountType === "percentage"
        ? (Number(estimate?.document_discount_value ?? 0) / 100).toFixed(2)
        : "0",
  );
  const [depositType, setDepositType] = useState(String(estimate?.deposit_type ?? "none"));
  const [depositValue, setDepositValue] = useState(
    depositType === "fixed"
      ? (Number(estimate?.deposit_value ?? 0) / 100).toFixed(2)
      : depositType === "percentage"
        ? (Number(estimate?.deposit_value ?? 0) / 100).toFixed(2)
        : "0",
  );
  const [showDiscount, setShowDiscount] = useState(discountType !== "none");
  const [showFees, setShowFees] = useState(initialFees.length > 0);
  const [showDeposit, setShowDeposit] = useState(depositType !== "none");
  const [showCustomerMessage, setShowCustomerMessage] = useState(
    Boolean(String(state.values?.customerMessage ?? (isInvoice ? estimate?.customer_notes : estimate?.customer_message) ?? "").trim()),
  );
  const [showInternalNotes, setShowInternalNotes] = useState(
    Boolean(String(state.values?.internalNotes ?? estimate?.internal_notes ?? "").trim()),
  );
  const [allowPartialPayments, setAllowPartialPayments] = useState(Boolean(estimate?.allow_partial_payments));
  const [expandedLineIndex, setExpandedLineIndex] = useState<number | null>(
    isInvoice && (!initialLines.length || newDocument) ? 0 : null,
  );

  const selectedExistingCustomerId = customerId === manualCustomerOption ? "" : customerId;
  const visibleLocations = locations.filter((row) => row.customer_id === selectedExistingCustomerId);
  const visibleJobs = jobs.filter((row) => row.customer_id === selectedExistingCustomerId);
  const selectedCustomer = customers.find((row) => row.id === selectedExistingCustomerId) ?? null;
  useEffect(() => {
    if (customerId === manualCustomerOption) {
      setManualCustomerDrawerOpen(true);
    } else {
      setManualCustomerDrawerOpen(false);
    }
  }, [customerId]);
  const taxEnabled = Boolean(businessTaxSettings?.taxEnabled);
  const taxContext =
    isInvoice && businessTaxSettings
      ? resolveInvoiceTaxContext({
          settings: businessTaxSettings,
          customer: selectedCustomer
            ? {
                id: selectedCustomer.id,
                taxExempt: Boolean(selectedCustomer.tax_exempt),
                taxExemptionReference: selectedCustomer.tax_exemption_reference ?? null,
              }
            : null,
        })
      : null;

  const updateLine = (index: number, patch: Partial<EstimateLineDraft>) =>
    setLines((current) => current.map((line, position) => (position === index ? { ...line, ...patch } : line)));

  const addPriceItem = (index: number, id: string) => {
    const item = priceItems.find((row) => row.id === id);
    if (!item) return;
    updateLine(index, {
      priceBookItemId: item.id,
      serviceId: item.service_id || undefined,
      name: item.name,
      description: item.description || "",
      unitType: item.unit_type,
      unitPrice: (item.default_unit_price_cents / 100).toFixed(2),
      internalCost: (item.internal_cost_cents / 100).toFixed(2),
      taxable: item.is_taxable,
      taxCode: item.tax_code ?? "",
    });
  };

  const totals = useMemo<ReturnType<typeof calculateFinancialDocument> | InvoiceFinancialDocumentResult | null>(() => {
    try {
      const documentDiscount: Discount =
        discountType === "fixed"
          ? { type: "fixed" as const, value: parseCurrencyToCents(discountValue) ?? 0 }
          : discountType === "percentage"
            ? { type: "percentage" as const, value: Math.round(Number(discountValue) * 100) }
            : { type: "none" as const, value: 0 };
      const deposit: Discount =
        depositType === "fixed"
          ? { type: "fixed" as const, value: parseCurrencyToCents(depositValue) ?? 0 }
          : depositType === "percentage"
            ? { type: "percentage" as const, value: Math.round(Number(depositValue) * 100) }
            : { type: "none" as const, value: 0 };
      const baseInput = {
        currency: "USD",
        lines: lines.map((line) => ({
          currency: "USD",
          quantity: line.quantity,
          unitPriceCents: parseCurrencyToCents(line.unitPrice) ?? 0,
          taxable: line.taxable,
          discount: lineDiscount(line),
        })),
        feesCents: fees.map((fee) => parseCurrencyToCents(fee.amount) ?? 0),
        documentDiscount,
        deposit,
      };
      return isInvoice && taxContext ? calculateInvoiceDocumentWithTax({ ...baseInput, taxContext }) : calculateFinancialDocument(baseInput);
    } catch {
      return null;
    }
  }, [lines, fees, discountType, discountValue, depositType, depositValue, isInvoice, taxContext]);

  const error = (field: string) =>
    state.fieldErrors?.[field] ? (
      <small className="crm-field-error" id={`${field}-error`}>
        {state.fieldErrors[field]}
      </small>
    ) : null;

  const fieldTitle = (label: string, required = false) => (
    <span className="estimate-field-title">
      {label}
      {required ? <small className="estimate-required" aria-hidden="true">*</small> : null}
    </span>
  );

  const addLine = () => {
    setExpandedLineIndex(lines.length);
    setLines((current) => [...current, blankLine(businessTaxSettings?.defaultInvoiceItemTaxable ?? true)]);
  };
  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, position) => position !== index));
    setExpandedLineIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  };
  const lineAmount = (index: number) => {
    if (totals?.lines[index]) return formatCents(isInvoice ? totals.lines[index].lineSubtotalCents : totals.lines[index].lineTotalCents);
    const quantity = Number(lines[index]?.quantity ?? 0);
    const unitPrice = parseCurrencyToCents(lines[index]?.unitPrice ?? "0") ?? 0;
    return formatCents(Number.isFinite(quantity) ? Math.round(quantity * unitPrice) : 0);
  };

  const customerMessageValue = String(state.values?.customerMessage ?? (isInvoice ? estimate?.customer_notes : estimate?.customer_message) ?? "");
  const internalNotesValue = String(state.values?.internalNotes ?? estimate?.internal_notes ?? "");

  return (
    <form action={formAction} className={`estimate-form estimate-builder${isInvoice ? " invoice-builder" : ""}`}>
      {state.error && <div className="workspace-notice error wide" role="alert">{state.error}</div>}
      {(!estimate || newDocument) && <input type="hidden" name="requestKey" value={requestKey.current} />}
      <input type="hidden" name="linesJson" value={JSON.stringify(lines)} />
      <input type="hidden" name="feesJson" value={JSON.stringify(fees)} />
      {isInvoice && customerId === manualCustomerOption && (
        <>
          <input type="hidden" name="manualCustomerFirstName" value={manualCustomerFirstName} />
          <input type="hidden" name="manualCustomerLastName" value={manualCustomerLastName} />
          <input type="hidden" name="manualCustomerCompanyName" value={manualCustomerCompanyName} />
          <input type="hidden" name="manualCustomerEmail" value={manualCustomerEmail} />
          <input type="hidden" name="manualCustomerPhone" value={manualCustomerPhone} />
        </>
      )}

      <div className="estimate-builder-main">
        <section className="estimate-section">
          <div className="estimate-section-header">
            <div>
              <h2>Customer &amp; details</h2>
            </div>
          </div>
          <div className="estimate-builder-grid estimate-builder-grid--details">
            <label>
              {fieldTitle("Customer", true)}
              <select
                required
                name="customerId"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                aria-describedby={state.fieldErrors?.customerId ? "customerId-error" : undefined}
              >
                <option value="">Choose customer</option>
                {isInvoice && <option value={manualCustomerOption}>Add a new customer</option>}
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customerLabel(customer)}
                  </option>
                ))}
              </select>
              {error("customerId")}
            </label>

            <label>
              Service location
              <select
                name="serviceLocationId"
                defaultValue={String(state.values?.serviceLocationId ?? estimate?.service_location_id ?? "")}
                disabled={customerId === manualCustomerOption}
                aria-describedby={state.fieldErrors?.serviceLocationId ? "serviceLocationId-error" : undefined}
              >
                <option value="">No location</option>
                {visibleLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.location_name} — {location.street_address}
                  </option>
                ))}
              </select>
              {error("serviceLocationId")}
            </label>

            <label>
              Related job
              <select
                name="jobId"
                defaultValue={String(state.values?.jobId ?? estimate?.job_id ?? "")}
                disabled={customerId === manualCustomerOption}
                aria-describedby={state.fieldErrors?.jobId ? "jobId-error" : undefined}
              >
                <option value="">No related job</option>
                {visibleJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    #{job.job_number} — {job.title}
                  </option>
                ))}
              </select>
              {error("jobId")}
            </label>

            {isInvoice && customerId === manualCustomerOption && (
              <div className="estimate-field-span-3 invoice-inline-customer-panel">
                <div className="invoice-inline-customer-panel__summary">
                  <div>
                    <strong>New customer details</strong>
                    <p>Add only the required fields so this customer can be created from the invoice.</p>
                  </div>
                  <button type="button" className="sv-button sv-secondary" onClick={() => setManualCustomerDrawerOpen(true)}>
                    Add required details
                  </button>
                </div>
                <div className="invoice-inline-customer-panel__chips" aria-live="polite">
                  <span>{manualCustomerFirstName.trim() ? manualCustomerFirstName.trim() : "First name required"}</span>
                  <span>{manualCustomerEmail.trim() ? manualCustomerEmail.trim() : "Email required"}</span>
                  <span>{manualCustomerPhone.trim() ? manualCustomerPhone.trim() : "Phone required"}</span>
                </div>
                {error("manualCustomerFirstName")}
                {error("manualCustomerEmail")}
                {error("manualCustomerPhone")}
                {error("manualCustomerCreate")}
              </div>
            )}

            <label>
              Issue date
              <input name="issueDate" type="date" defaultValue={String(estimate?.issue_date ?? new Date().toISOString().slice(0, 10))} />
            </label>

            <label>
              {isInvoice ? "Due date" : "Expiration date"}
              <input
                name={isInvoice ? "dueDate" : "expirationDate"}
                type="date"
                defaultValue={String(isInvoice ? estimate?.due_date ?? "" : estimate?.expiration_date ?? "")}
                aria-describedby={state.fieldErrors?.[isInvoice ? "dueDate" : "expirationDate"] ? `${isInvoice ? "dueDate" : "expirationDate"}-error` : undefined}
              />
              {error(isInvoice ? "dueDate" : "expirationDate")}
            </label>

            <label>
              {isInvoice ? "Invoice title" : "Estimate title"}
              <input
                required
                name="title"
                defaultValue={String(estimate?.title ?? "")}
                placeholder={isInvoice ? "Spring cleanup, August visit, etc." : ""}
                aria-describedby={state.fieldErrors?.title ? "title-error" : undefined}
              />
              {error("title")}
            </label>
          </div>

          {isInvoice && selectedCustomer?.tax_exempt && (
            <div className="workspace-notice">
              This customer is tax exempt
              {selectedCustomer.tax_exemption_reference ? ` (${selectedCustomer.tax_exemption_reference})` : ""}. Sales tax will not be applied to this invoice.
            </div>
          )}

          {isInvoice && businessTaxSettings && (
            <div className="estimate-tax-banner">
              {businessTaxSettings.taxEnabled ? (
                businessTaxSettings.calculationMethod === "automatic" ? (
                  <strong>Sales tax on · Automatic</strong>
                ) : businessTaxSettings.displayMode === "exclusive" ? (
                  <strong>Sales tax on · {(businessTaxSettings.manualTaxRateBasisPoints / 100).toFixed(2)}%</strong>
                ) : (
                  <strong>Sales tax on · Added to taxable items</strong>
                )
              ) : (
                <strong>Sales tax off</strong>
              )}
            </div>
          )}
        </section>

        <section className="estimate-section">
          <div className="estimate-section-header">
            <div>
              <h2>Line items</h2>
            </div>
          </div>

          {error("lines")}

          <div className={`estimate-line-list${isInvoice ? " invoice-line-list" : ""}`}>
            {lines.map((line, index) => {
              const badges = lineSettingBadges(line, taxEnabled);
              const isExpanded = !isInvoice || expandedLineIndex === index;
              return (
                <article className={`estimate-line-card${isExpanded ? " expanded" : " collapsed"}${isInvoice ? " invoice-line-card" : ""}`} key={index}>
                  <div className="estimate-line-summary">
                    <button
                      type="button"
                      className="estimate-line-summary-toggle"
                      onClick={() => setExpandedLineIndex(isExpanded ? null : index)}
                      aria-expanded={isExpanded}
                      aria-controls={`invoice-line-editor-${index}`}
                    >
                      <div className="estimate-line-summary-main">
                        <span className="estimate-line-label">Item {index + 1}</span>
                        <strong>{line.name.trim() || "Untitled item"}</strong>
                        <small>{line.description?.trim() || (badges.length ? badges.join(" · ") : "Edit item details")}</small>
                      </div>
                    </button>
                    <div className="estimate-line-summary-metrics">
                      <span>
                        Qty
                        <b>{line.quantity || "0"}</b>
                      </span>
                      <span>
                        Rate
                        <b>{formatCents(parseCurrencyToCents(line.unitPrice) ?? 0)}</b>
                      </span>
                      <span className="estimate-line-amount">
                        Amount
                        <b>{lineAmount(index)}</b>
                      </span>
                    </div>
                    <div className="estimate-line-summary-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setExpandedLineIndex(isExpanded ? null : index)}
                        aria-label={isExpanded ? `Collapse invoice item ${index + 1}` : `Edit invoice item ${index + 1}`}
                      >
                        {isExpanded ? "Done" : "Edit"}
                      </button>
                      <button
                        type="button"
                        className="text-button danger"
                        disabled={lines.length === 1}
                        aria-label={`Remove invoice item ${index + 1}`}
                        onClick={() => removeLine(index)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {badges.length > 0 && (
                    <div className="estimate-line-badges" aria-label={`Invoice item ${index + 1} settings`}>
                      {badges.map((badge) => (
                        <span key={badge}>{badge}</span>
                      ))}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="estimate-line-fields" id={`invoice-line-editor-${index}`}>
                      <div className="estimate-line-fields-grid">
                        <label>
                          Price book
                          <select value={line.priceBookItemId ?? ""} onChange={(event) => addPriceItem(index, event.target.value)}>
                            <option value="">Custom item</option>
                            {priceItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="estimate-field-span-2">
                          Item
                          <input value={line.name} onChange={(event) => updateLine(index, { name: event.target.value })} placeholder="AC tune-up, service fee, etc." />
                        </label>

                        <span>
                          Line amount
                          <b>{lineAmount(index)}</b>
                        </span>

                        <label>
                          Qty
                          <input value={line.quantity} inputMode="decimal" onChange={(event) => updateLine(index, { quantity: event.target.value })} />
                        </label>

                        <label>
                          Rate
                          <div className="estimate-money-input">
                            <span>$</span>
                            <input
                              value={currencyInputValue(line.unitPrice)}
                              type="number"
                              min="0"
                              step=".01"
                              onChange={(event) => updateLine(index, { unitPrice: event.target.value || "0" })}
                            />
                          </div>
                        </label>

                        <label className="estimate-field-span-3">
                          Description
                          <textarea
                            rows={2}
                            value={line.description ?? ""}
                            onChange={(event) => updateLine(index, { description: event.target.value })}
                            placeholder="Optional description shown on the invoice."
                          />
                        </label>
                      </div>

                      <div className="estimate-line-advanced">
                        <h3>More options</h3>
                        <div className="estimate-line-advanced-grid">
                          <label>
                            Unit
                            <select value={line.unitType} onChange={(event) => updateLine(index, { unitType: event.target.value })}>
                              {priceBookUnitTypes.map((unit) => (
                                <option key={unit} value={unit}>
                                  {unit.replaceAll("_", " ")}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Discount type
                            <select value={line.discountType} onChange={(event) => updateLine(index, { discountType: event.target.value as EstimateLineDraft["discountType"] })}>
                              <option value="none">None</option>
                              <option value="fixed">Fixed</option>
                              <option value="percentage">Percent</option>
                            </select>
                          </label>

                          <label>
                            Discount value
                            <input
                              value={line.discountValue}
                              type="number"
                              min="0"
                              step=".01"
                              disabled={line.discountType === "none"}
                              onChange={(event) => updateLine(index, { discountValue: event.target.value })}
                            />
                          </label>

                          {taxEnabled && (
                            <>
                              <label className="estimate-toggle-row">
                                <input type="checkbox" checked={line.taxable} onChange={(event) => updateLine(index, { taxable: event.target.checked })} />
                                <span>Taxable item</span>
                              </label>
                              <label>
                                Tax code
                                <input value={line.taxCode ?? ""} placeholder="Optional" onChange={(event) => updateLine(index, { taxCode: event.target.value })} />
                              </label>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="estimate-add-row">
            <button type="button" className="sv-button sv-secondary sv-small" onClick={addLine}>
              + Add item
            </button>
          </div>
        </section>

        <section className="estimate-section">
          <div className="estimate-section-header">
            <div>
              <h2>Adjustments</h2>
            </div>
          </div>

          <div className="estimate-adjustment-actions">
            {!showDiscount && (
              <button type="button" className="sv-button sv-secondary sv-small" onClick={() => { setShowDiscount(true); setDiscountType("fixed"); }}>
                + Add discount
              </button>
            )}
            {!showFees && (
              <button type="button" className="sv-button sv-secondary sv-small" onClick={() => { setShowFees(true); if (!fees.length) setFees([{ name: "", amount: "0.00" }]); }}>
                + Add fee
              </button>
            )}
            {!showDeposit && (
              <button type="button" className="sv-button sv-secondary sv-small" onClick={() => { setShowDeposit(true); setDepositType("percentage"); }}>
                + Require deposit
              </button>
            )}
          </div>

          <div className="estimate-adjustment-stack">
            {showDiscount && (
              <div className="estimate-adjustment-row">
                <strong>Discount</strong>
                <label>
                  Type
                  <select name="documentDiscountType" value={discountType} onChange={(event) => setDiscountType(event.target.value)}>
                    <option value="none">None</option>
                    <option value="fixed">Fixed</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </label>
                <label>
                  Value
                  <input
                    name="documentDiscountValue"
                    value={discountValue}
                    type="number"
                    min="0"
                    step=".01"
                    disabled={discountType === "none"}
                    onChange={(event) => setDiscountValue(event.target.value)}
                  />
                </label>
                <button type="button" className="text-button danger" onClick={() => { setShowDiscount(false); setDiscountType("none"); setDiscountValue("0"); }}>
                  Remove
                </button>
              </div>
            )}
            {error("documentDiscountValue")}

            {showFees && (
              <div className="estimate-adjustment-block">
                <div className="estimate-adjustment-block-header">
                  <strong>Fees</strong>
                  <button type="button" className="text-button danger" onClick={() => { setShowFees(false); setFees([]); }}>
                    Remove all fees
                  </button>
                </div>
                <div className="estimate-fee-list">
                  {fees.map((fee, index) => (
                    <div className="estimate-fee-row" key={index}>
                      <input
                        placeholder="Fee name"
                        value={fee.name}
                        onChange={(event) => setFees((current) => current.map((row, position) => (position === index ? { ...row, name: event.target.value } : row)))}
                      />
                      <div className="estimate-money-input">
                        <span>$</span>
                        <input
                          type="number"
                          min="0"
                          step=".01"
                          value={currencyInputValue(fee.amount)}
                          onChange={(event) => setFees((current) => current.map((row, position) => (position === index ? { ...row, amount: event.target.value || "0" } : row)))}
                        />
                      </div>
                      <button type="button" className="text-button danger" onClick={() => setFees((current) => current.filter((_, position) => position !== index))}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="text-button" onClick={() => setFees((current) => [...current, { name: "", amount: "0.00" }])}>
                  + Add another fee
                </button>
                {error("fees")}
              </div>
            )}

            {showDeposit && (
              <div className="estimate-adjustment-row">
                <strong>Deposit required</strong>
                <label>
                  Type
                  <select name="depositType" value={depositType} onChange={(event) => setDepositType(event.target.value)}>
                    <option value="none">None</option>
                    <option value="fixed">Fixed</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </label>
                <label>
                  Value
                  <input
                    name="depositValue"
                    value={depositValue}
                    type="number"
                    min="0"
                    step=".01"
                    disabled={depositType === "none"}
                    onChange={(event) => setDepositValue(event.target.value)}
                  />
                </label>
                <button type="button" className="text-button danger" onClick={() => { setShowDeposit(false); setDepositType("none"); setDepositValue("0"); }}>
                  Remove
                </button>
              </div>
            )}
            {error("depositValue")}
          </div>
        </section>

        {isInvoice && (
          <section className="estimate-section">
            <div className="estimate-section-header">
              <div>
                <h2>Online payments</h2>
              </div>
            </div>
            {onlinePaymentsReady ? (
              <div className="estimate-payment-settings">
                <div className="estimate-payment-state">
                  <strong>Card payments are available</strong>
                  <span>Customers can pay online after you send this invoice.</span>
                </div>
                <label className="estimate-toggle-row">
                  <input type="checkbox" name="allowPartialPayments" checked={allowPartialPayments} onChange={(event) => setAllowPartialPayments(event.target.checked)} />
                  <span>Allow partial payments</span>
                </label>
                {allowPartialPayments && (
                  <label className="estimate-payment-minimum">
                    Minimum partial payment
                    <div className="estimate-money-input">
                      <span>$</span>
                      <input name="minimumPartialPayment" type="number" min=".50" step=".01" defaultValue={(Number(estimate?.minimum_partial_payment_cents ?? 100) / 100).toFixed(2)} />
                    </div>
                    {error("minimumPartialPayment")}
                  </label>
                )}
              </div>
            ) : (
              <div className="estimate-payment-unavailable">
                <strong>Online payments unavailable</strong>
                <p>Connect Stripe to accept card payments on this invoice. You can still create the invoice and collect payment another way.</p>
              </div>
            )}
          </section>
        )}

        <section className="estimate-section">
          <div className="estimate-section-header">
            <div>
              <h2>Message &amp; notes</h2>
            </div>
          </div>
          <div className="estimate-adjustment-actions">
            {!showCustomerMessage && (
              <button type="button" className="sv-button sv-secondary sv-small" onClick={() => setShowCustomerMessage(true)}>
                + Add customer message
              </button>
            )}
            {!showInternalNotes && (
              <button type="button" className="sv-button sv-secondary sv-small" onClick={() => setShowInternalNotes(true)}>
                + Add internal note
              </button>
            )}
          </div>
          <div className="estimate-notes-stack">
            {showCustomerMessage && (
              <label className="estimate-note-field">
                Customer message
                <textarea name="customerMessage" rows={3} defaultValue={customerMessageValue} />
                <small>Visible to the customer.</small>
              </label>
            )}
            {showInternalNotes && (
              <label className="estimate-note-field">
                Internal notes
                <textarea name="internalNotes" rows={3} defaultValue={internalNotesValue} />
                <small>Only visible to your team.</small>
              </label>
            )}
          </div>
        </section>
      </div>

      <aside className="estimate-builder-sidebar">
        <div className="estimate-summary-card">
          <div className="estimate-section-header">
            <div>
              <h2>{isInvoice ? "Invoice summary" : "Estimate summary"}</h2>
            </div>
          </div>
          {totals ? (
            <dl className="estimate-summary-list">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatCents(totals.subtotalCents)}</dd>
              </div>
              {totals.discountTotalCents > 0 && (
                <div>
                  <dt>Discount</dt>
                  <dd>−{formatCents(totals.discountTotalCents)}</dd>
                </div>
              )}
              {totals.feeTotalCents > 0 && (
                <div>
                  <dt>Fees</dt>
                  <dd>{formatCents(totals.feeTotalCents)}</dd>
                </div>
              )}
              {isInvoice && taxEnabled && (
                <div>
                  <dt>Tax</dt>
                  <dd>{formatCents(totals.taxTotalCents)}</dd>
                </div>
              )}
              <div className="total">
                <dt>Total</dt>
                <dd>{formatCents(totals.grandTotalCents)}</dd>
              </div>
              {totals.depositRequiredCents > 0 && (
                <div>
                  <dt>Deposit due</dt>
                  <dd>{formatCents(totals.depositRequiredCents)}</dd>
                </div>
              )}
              {totals.depositRequiredCents > 0 && totals.grandTotalCents > totals.depositRequiredCents && (
                <div>
                  <dt>Remaining balance</dt>
                  <dd>{formatCents(totals.grandTotalCents - totals.depositRequiredCents)}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="estimate-summary-empty">Correct the invoice details to preview the totals.</p>
          )}
          <div className="estimate-summary-actions">
            <button className="sv-button" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </button>
          </div>
        </div>
      </aside>

      {isInvoice && customerId === manualCustomerOption && (
        <ManagementDrawer
          open={manualCustomerDrawerOpen}
          title="Add new customer"
          subtitle="Enter only the required details. Servonas will save the customer when this invoice saves."
          onDirty={() => {}}
          onClose={() => setManualCustomerDrawerOpen(false)}
        >
          <div className="invoice-customer-drawer-form">
            <div className="quick-form-grid">
              <label>
                {fieldTitle("First name", true)}
                <input
                  value={manualCustomerFirstName}
                  onChange={(event) => setManualCustomerFirstName(event.target.value)}
                  placeholder="Jane"
                  required
                  aria-invalid={state.fieldErrors?.manualCustomerFirstName ? "true" : undefined}
                />
                {error("manualCustomerFirstName")}
              </label>
              <label>
                Last name
                <input
                  value={manualCustomerLastName}
                  onChange={(event) => setManualCustomerLastName(event.target.value)}
                  placeholder="Smith"
                />
              </label>
              <label className="wide">
                Company name
                <input
                  value={manualCustomerCompanyName}
                  onChange={(event) => setManualCustomerCompanyName(event.target.value)}
                  placeholder="Optional business name"
                />
              </label>
              <label>
                {fieldTitle("Email", true)}
                <input
                  type="email"
                  value={manualCustomerEmail}
                  onChange={(event) => setManualCustomerEmail(event.target.value)}
                  placeholder="jane@example.com"
                  required
                  aria-invalid={state.fieldErrors?.manualCustomerEmail ? "true" : undefined}
                />
                {error("manualCustomerEmail")}
              </label>
              <label>
                {fieldTitle("Phone", true)}
                <input
                  value={manualCustomerPhone}
                  onChange={(event) => setManualCustomerPhone(formatPhoneNumber(event.target.value))}
                  onBlur={(event) => setManualCustomerPhone(formatPhoneNumber(event.target.value))}
                  placeholder="(555) 555-0100"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  aria-invalid={state.fieldErrors?.manualCustomerPhone ? "true" : undefined}
                />
                {error("manualCustomerPhone")}
              </label>
            </div>
            {error("manualCustomerCreate")}
            <div className="invoice-customer-drawer-help">
              The customer is added to your workspace automatically after the invoice saves successfully.
            </div>
            <footer>
              <button type="button" className="sv-button sv-secondary" onClick={() => setManualCustomerDrawerOpen(false)}>
                Done
              </button>
            </footer>
          </div>
        </ManagementDrawer>
      )}
    </form>
  );
}
