"use client";

import { useActionState } from "react";
import type { ServiceCatalogActionState } from "@/app/app/[businessSlug]/price-book/actions";

type Service = {
  name: string;
  description: string | null;
  duration_minutes: number;
  price_amount: number | null;
  price_label: string;
  recurring_allowed: boolean;
  required_skills: string[] | null;
  active: boolean;
};

export function ServiceCatalogForm({ service, action, returnToPriceBook = false }: {
  service: Service;
  action: (state: ServiceCatalogActionState, data: FormData) => Promise<ServiceCatalogActionState>;
  returnToPriceBook?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const checked = (name: "recurringAllowed" | "active", fallback: boolean) => state.values ? state.values[name] === "on" : fallback;
  const error = (field: string) => state.fieldErrors?.[field] && <small className="crm-field-error">{state.fieldErrors[field]}</small>;

  return <form action={formAction} className="price-book-form service-catalog-form">
    {returnToPriceBook && <input type="hidden" name="returnToPriceBook" value="true"/>}
    {state.error && <div className="workspace-notice error wide" role="alert">{state.error}</div>}
    <label className="wide">Service name<input required name="name" maxLength={150} defaultValue={value("name", service.name)}/>{error("name")}</label>
    <label>Default duration (minutes)<input required name="durationMinutes" type="number" min="15" max="1440" step="15" defaultValue={value("durationMinutes", String(service.duration_minutes))}/>{error("durationMinutes")}</label>
    <label>Price display<select name="priceLabel" defaultValue={value("priceLabel", service.price_label)}><option value="fixed">Fixed price</option><option value="starting_at">Starting at</option><option value="quote">Request quote</option></select></label>
    <label>Default price<input name="price" type="number" min="0" step="0.01" placeholder="Leave empty for quote" defaultValue={value("price", service.price_amount === null ? "" : String(service.price_amount))}/>{error("price")}</label>
    <label>Required skills <small>Optional, separated by commas</small><input name="requiredSkills" defaultValue={value("requiredSkills", (service.required_skills ?? []).join(", "))} placeholder="EPA certification, Diagnostics"/>{error("requiredSkills")}</label>
    <label className="wide">Customer-facing description <small>Optional</small><textarea name="description" rows={4} maxLength={2000} defaultValue={value("description", service.description ?? "")}/>{error("description")}</label>
    <label className="price-book-toggle"><input name="recurringAllowed" type="checkbox" defaultChecked={checked("recurringAllowed", service.recurring_allowed)}/><span>Recurring service is available</span></label>
    <label className="price-book-toggle"><input name="active" type="checkbox" defaultChecked={checked("active", service.active)}/><span>Active and available for new work</span></label>
    <button className="sv-button" disabled={pending}>{pending ? "Saving…" : "Save service"}</button>
  </form>;
}
