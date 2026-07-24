"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import type { EstimateActionState, EstimateFeeDraft, EstimateLineDraft } from "@/app/app/[businessSlug]/estimates/actions";
import { calculateFinancialDocument, type Discount } from "@/lib/financial/calculations";
import { formatCents, parseCurrencyToCents, priceBookUnitTypes } from "@/lib/financial/priceBook";

type Customer = { id: string; first_name: string; last_name: string; company_name?: string | null };
type Location = { id: string; customer_id: string; location_name: string; street_address: string };
type Job = { id: string; customer_id: string; job_number: number; title: string };
type PriceItem = { id: string; name: string; description?: string | null; unit_type: string; default_unit_price_cents: number; internal_cost_cents: number; is_taxable: boolean; service_id?: string | null };
type TaxRate = { id: string; name: string; rate_basis_points: number; is_default: boolean };
type Estimate = Record<string, string | number | null | undefined>;

const blankLine = (): EstimateLineDraft => ({ name: "", quantity: "1", unitType: "each", unitPrice: "0.00", internalCost: "0.00", discountType: "none", discountValue: "0", taxable: true, taxRateBasisPoints: 0 });

export default function EstimateForm({
  action, customers, locations, jobs, priceItems, taxRates, estimate, initialLines = [], initialFees = [], submitLabel,
}: {
  action: (state: EstimateActionState, data: FormData) => Promise<EstimateActionState>;
  customers: Customer[]; locations: Location[]; jobs: Job[]; priceItems: PriceItem[]; taxRates: TaxRate[];
  estimate?: Estimate; initialLines?: EstimateLineDraft[]; initialFees?: EstimateFeeDraft[]; submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const requestKey = useRef(typeof crypto === "undefined" ? "" : crypto.randomUUID());
  const [customerId, setCustomerId] = useState(String(estimate?.customer_id ?? ""));
  const [lines, setLines] = useState(initialLines.length ? initialLines : [blankLine()]);
  const [fees, setFees] = useState(initialFees);
  const [discountType, setDiscountType] = useState(String(estimate?.document_discount_type ?? "none"));
  const [discountValue, setDiscountValue] = useState(
    discountType === "fixed" ? (Number(estimate?.document_discount_value ?? 0) / 100).toFixed(2)
      : discountType === "percentage" ? (Number(estimate?.document_discount_value ?? 0) / 100).toFixed(2) : "0",
  );
  const [depositType, setDepositType] = useState(String(estimate?.deposit_type ?? "none"));
  const [depositValue, setDepositValue] = useState(
    depositType === "fixed" ? (Number(estimate?.deposit_value ?? 0) / 100).toFixed(2)
      : depositType === "percentage" ? (Number(estimate?.deposit_value ?? 0) / 100).toFixed(2) : "0",
  );
  const visibleLocations = locations.filter((row) => row.customer_id === customerId);
  const visibleJobs = jobs.filter((row) => row.customer_id === customerId);
  const updateLine = (index: number, patch: Partial<EstimateLineDraft>) => setLines((current) => current.map((line, position) => position === index ? { ...line, ...patch } : line));
  const addPriceItem = (index: number, id: string) => {
    const item = priceItems.find((row) => row.id === id);
    if (!item) return;
    const defaultTax = taxRates.find((rate) => rate.is_default);
    updateLine(index, {
      priceBookItemId: item.id, serviceId: item.service_id || undefined, name: item.name,
      description: item.description || "", unitType: item.unit_type,
      unitPrice: (item.default_unit_price_cents / 100).toFixed(2),
      internalCost: (item.internal_cost_cents / 100).toFixed(2),
      taxable: item.is_taxable, taxRateBasisPoints: item.is_taxable ? defaultTax?.rate_basis_points ?? 0 : 0,
    });
  };
  const totals = useMemo(() => {
    try {
      const documentDiscount: Discount = discountType === "fixed"
        ? { type: "fixed" as const, value: parseCurrencyToCents(discountValue) ?? 0 }
        : discountType === "percentage" ? { type: "percentage" as const, value: Math.round(Number(discountValue) * 100) }
          : { type: "none" as const, value: 0 };
      const deposit: Discount = depositType === "fixed"
        ? { type: "fixed" as const, value: parseCurrencyToCents(depositValue) ?? 0 }
        : depositType === "percentage" ? { type: "percentage" as const, value: Math.round(Number(depositValue) * 100) }
          : { type: "none" as const, value: 0 };
      return calculateFinancialDocument({
        currency: "USD",
        lines: lines.map((line) => ({
          currency: "USD", quantity: line.quantity, unitPriceCents: parseCurrencyToCents(line.unitPrice) ?? 0,
          taxable: line.taxable, taxRateBasisPoints: line.taxRateBasisPoints,
          discount: line.discountType === "fixed"
            ? { type: "fixed", value: parseCurrencyToCents(line.discountValue) ?? 0 }
            : line.discountType === "percentage" ? { type: "percentage", value: Math.round(Number(line.discountValue) * 100) }
              : { type: "none", value: 0 },
        })),
        feesCents: fees.map((fee) => parseCurrencyToCents(fee.amount) ?? 0), documentDiscount, deposit,
      });
    } catch { return null; }
  }, [lines, fees, discountType, discountValue, depositType, depositValue]);
  const error = (field: string) => state.fieldErrors?.[field] && <small className="crm-field-error">{state.fieldErrors[field]}</small>;

  return <form action={formAction} className="estimate-form">
    {state.error && <div className="workspace-notice error wide">{state.error}</div>}
    {!estimate && <input type="hidden" name="requestKey" value={requestKey.current}/>}
    <input type="hidden" name="linesJson" value={JSON.stringify(lines)}/><input type="hidden" name="feesJson" value={JSON.stringify(fees)}/>
    <label className="wide">Estimate title<input required name="title" defaultValue={String(estimate?.title ?? "")}/>{error("title")}</label>
    <label>Customer<select required name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name || `${customer.first_name} ${customer.last_name}`}</option>)}</select>{error("customerId")}</label>
    <label>Service location<select name="serviceLocationId" defaultValue={String(estimate?.service_location_id ?? "")}><option value="">No location</option>{visibleLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name} — {location.street_address}</option>)}</select>{error("serviceLocationId")}</label>
    <label>Related job<select name="jobId" defaultValue={String(estimate?.job_id ?? "")}><option value="">Standalone estimate</option>{visibleJobs.map((job) => <option key={job.id} value={job.id}>#{job.job_number} — {job.title}</option>)}</select>{error("jobId")}</label>
    <label>Issue date<input name="issueDate" type="date" defaultValue={String(estimate?.issue_date ?? new Date().toISOString().slice(0, 10))}/></label>
    <label>Expiration date<input name="expirationDate" type="date" defaultValue={String(estimate?.expiration_date ?? "")}/>{error("expirationDate")}</label>
    <section className="estimate-lines wide"><div className="panel-title"><div><h2>Line items</h2>{error("lines")}</div><button type="button" className="sv-button sv-secondary sv-small" onClick={() => setLines((current) => [...current, blankLine()])}>Add custom line</button></div>
      {lines.map((line, index) => <article key={index}>
        <label>Price book<select value={line.priceBookItemId ?? ""} onChange={(event) => addPriceItem(index, event.target.value)}><option value="">Custom item</option>{priceItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="line-name">Name<input value={line.name} onChange={(event) => updateLine(index, { name: event.target.value })}/></label>
        <label>Quantity<input value={line.quantity} inputMode="decimal" onChange={(event) => updateLine(index, { quantity: event.target.value })}/></label>
        <label>Unit<select value={line.unitType} onChange={(event) => updateLine(index, { unitType: event.target.value })}>{priceBookUnitTypes.map((unit) => <option key={unit} value={unit}>{unit.replaceAll("_", " ")}</option>)}</select></label>
        <label>Unit price<input value={line.unitPrice} type="number" min="0" step=".01" onChange={(event) => updateLine(index, { unitPrice: event.target.value })}/></label>
        <label>Discount<select value={line.discountType} onChange={(event) => updateLine(index, { discountType: event.target.value as EstimateLineDraft["discountType"] })}><option value="none">None</option><option value="fixed">Fixed</option><option value="percentage">Percent</option></select></label>
        <label>Discount value<input value={line.discountValue} type="number" min="0" step=".01" disabled={line.discountType === "none"} onChange={(event) => updateLine(index, { discountValue: event.target.value })}/></label>
        <label>Tax rate<select value={line.taxRateBasisPoints} disabled={!line.taxable} onChange={(event) => updateLine(index, { taxRateBasisPoints: Number(event.target.value) })}><option value={0}>No tax</option>{taxRates.map((rate) => <option key={rate.id} value={rate.rate_basis_points}>{rate.name} ({(rate.rate_basis_points / 100).toFixed(2)}%)</option>)}</select></label>
        <label className="price-book-toggle"><input type="checkbox" checked={line.taxable} onChange={(event) => updateLine(index, { taxable: event.target.checked })}/><span>Taxable</span></label>
        <button type="button" className="text-button danger" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>Remove</button>
      </article>)}
    </section>
    <section className="estimate-adjustments wide"><div><h2>Discount</h2><label>Type<select name="documentDiscountType" value={discountType} onChange={(event) => setDiscountType(event.target.value)}><option value="none">None</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option></select></label><label>Value<input name="documentDiscountValue" value={discountValue} type="number" min="0" step=".01" disabled={discountType === "none"} onChange={(event) => setDiscountValue(event.target.value)}/></label>{error("documentDiscountValue")}</div>
      <div><div className="panel-title"><h2>Fees</h2><button type="button" className="text-button" onClick={() => setFees((current) => [...current, { name: "", amount: "0.00" }])}>Add fee</button></div>{fees.map((fee, index) => <div className="estimate-fee" key={index}><input placeholder="Fee name" value={fee.name} onChange={(event) => setFees((current) => current.map((row, position) => position === index ? { ...row, name: event.target.value } : row))}/><input type="number" min="0" step=".01" value={fee.amount} onChange={(event) => setFees((current) => current.map((row, position) => position === index ? { ...row, amount: event.target.value } : row))}/><button type="button" className="text-button danger" onClick={() => setFees((current) => current.filter((_, position) => position !== index))}>Remove</button></div>)}{error("fees")}</div>
      <div><h2>Deposit</h2><label>Type<select name="depositType" value={depositType} onChange={(event) => setDepositType(event.target.value)}><option value="none">None</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option></select></label><label>Value<input name="depositValue" value={depositValue} type="number" min="0" step=".01" disabled={depositType === "none"} onChange={(event) => setDepositValue(event.target.value)}/></label>{error("depositValue")}</div>
    </section>
    <label className="wide">Customer-facing message<textarea name="customerMessage" rows={3} defaultValue={String(estimate?.customer_message ?? "")}/></label>
    <label className="wide">Internal notes<textarea name="internalNotes" rows={3} defaultValue={String(estimate?.internal_notes ?? "")}/></label>
    <aside className="estimate-preview wide"><h2>Estimate preview</h2>{totals ? <dl><div><dt>Subtotal</dt><dd>{formatCents(totals.subtotalCents)}</dd></div><div><dt>Discount</dt><dd>−{formatCents(totals.discountTotalCents)}</dd></div><div><dt>Tax</dt><dd>{formatCents(totals.taxTotalCents)}</dd></div><div><dt>Fees</dt><dd>{formatCents(totals.feeTotalCents)}</dd></div><div className="total"><dt>Total</dt><dd>{formatCents(totals.grandTotalCents)}</dd></div><div><dt>Deposit required</dt><dd>{formatCents(totals.depositRequiredCents)}</dd></div></dl> : <p>Correct the line items to preview totals.</p>}</aside>
    <button className="sv-button" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
  </form>;
}
