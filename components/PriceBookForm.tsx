"use client";

import { useActionState, useMemo, useState } from "react";
import type { PriceBookActionState } from "@/app/app/[businessSlug]/price-book/actions";
import { marginPercent, priceBookUnitTypes } from "@/lib/financial/priceBook";

type Option = { id: string; name: string };
type Item = Record<string, string | number | boolean | null | undefined>;

export default function PriceBookForm({
  action, categories, services, item, submitLabel,
}: {
  action: (state: PriceBookActionState, data: FormData) => Promise<PriceBookActionState>;
  categories: Option[];
  services: Option[];
  item?: Item;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const initialPrice = value("defaultUnitPrice", item ? (Number(item.default_unit_price_cents ?? 0) / 100).toFixed(2) : "0.00");
  const initialCost = value("internalCost", item ? (Number(item.internal_cost_cents ?? 0) / 100).toFixed(2) : "0.00");
  const [price, setPrice] = useState(Number(initialPrice));
  const [cost, setCost] = useState(Number(initialCost));
  const margin = useMemo(() => marginPercent(Math.round(price * 100), Math.round(cost * 100)), [price, cost]);
  const error = (field: string) => state.fieldErrors?.[field] && <small className="crm-field-error">{state.fieldErrors[field]}</small>;

  return <form action={formAction} className="price-book-form">
    {state.error && <div className="workspace-notice error wide" role="alert">{state.error}</div>}
    <label className="wide">Item name<input required name="name" defaultValue={value("name", String(item?.name ?? ""))} placeholder="Diagnostic fee"/>{error("name")}</label>
    <label>Category<select name="categoryId" defaultValue={value("categoryId", String(item?.category_id ?? ""))}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{error("categoryId")}</label>
    <label>Related service<select name="serviceId" defaultValue={value("serviceId", String(item?.service_id ?? ""))}><option value="">No related service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>{error("serviceId")}</label>
    <label>SKU or internal code<input name="sku" defaultValue={value("sku", String(item?.sku ?? ""))}/></label>
    <label>Unit type<select required name="unitType" defaultValue={value("unitType", String(item?.unit_type ?? "each"))}>{priceBookUnitTypes.map((unit) => <option key={unit} value={unit}>{unit.replaceAll("_", " ")}</option>)}</select>{error("unitType")}</label>
    <label>Default price<input required name="defaultUnitPrice" type="number" min="0" step="0.01" defaultValue={initialPrice} onChange={(event) => setPrice(Number(event.target.value))}/>{error("defaultUnitPrice")}</label>
    <label>Internal cost<input required name="internalCost" type="number" min="0" step="0.01" defaultValue={initialCost} onChange={(event) => setCost(Number(event.target.value))}/>{error("internalCost")}</label>
    <div className="price-book-margin"><span>Margin preview</span><strong>{margin === null ? "—" : `${margin.toFixed(2)}%`}</strong><small>Based on the saved price and internal cost.</small></div>
    <label>Estimated duration (minutes)<input name="estimatedDurationMinutes" type="number" min="1" max="10080" defaultValue={value("estimatedDurationMinutes", String(item?.estimated_duration_minutes ?? ""))}/>{error("estimatedDurationMinutes")}</label>
    <label>Sort order<input name="sortOrder" type="number" defaultValue={value("sortOrder", String(item?.sort_order ?? 0))}/></label>
    <label className="wide">Customer-facing description<textarea name="description" rows={3} defaultValue={value("description", String(item?.description ?? ""))}/></label>
    <label className="wide">Internal description<textarea name="internalDescription" rows={3} defaultValue={value("internalDescription", String(item?.internal_description ?? ""))}/></label>
    <label className="price-book-toggle"><input name="isTaxable" type="checkbox" defaultChecked={state.values ? state.values.isTaxable === "on" : item ? Boolean(item.is_taxable) : true}/><span>Taxable</span></label>
    <label className="price-book-toggle"><input name="isActive" type="checkbox" defaultChecked={state.values ? state.values.isActive === "on" : item ? Boolean(item.is_active) : true}/><span>Active and available for new documents</span></label>
    <button className="sv-button" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
  </form>;
}
