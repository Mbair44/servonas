"use client";

import { useActionState } from "react";
import type { CrmActionState } from "@/app/app/[businessSlug]/customers/actions";

type Customer = {
  first_name?: string | null; last_name?: string | null; company_name?: string | null;
  email?: string | null; phone?: string | null; secondary_phone?: string | null;
  preferred_contact_method?: string | null; notes?: string | null; tags?: string[] | null;
  lead_source?: string | null; is_active?: boolean | null;
};

export default function CustomerCrmForm({
  action,
  customer,
  submitLabel,
}: {
  action: (state: CrmActionState, formData: FormData) => Promise<CrmActionState>;
  customer?: Customer;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const fieldError = (name: string) => state.fieldErrors?.[name] ? <small className="crm-field-error">{state.fieldErrors[name]}</small> : null;
  return <form action={formAction} className="crm-form">
    {state.error && <div className="workspace-notice error crm-wide" role="alert">{state.error}</div>}
    <input type="hidden" name="confirmDuplicate" value={state.values?.confirmDuplicate ?? ""}/>
    <label>First name<input name="firstName" required defaultValue={value("firstName", customer?.first_name ?? "")}/>{fieldError("firstName")}</label>
    <label>Last name<input name="lastName" defaultValue={value("lastName", customer?.last_name ?? "")}/></label>
    <label className="crm-wide">Company<input name="companyName" defaultValue={value("companyName", customer?.company_name ?? "")}/></label>
    <label>Email<input name="email" type="email" defaultValue={value("email", customer?.email ?? "")}/>{fieldError("email")}</label>
    <label>Primary phone<input name="phone" type="tel" defaultValue={value("phone", customer?.phone ?? "")}/>{fieldError("phone")}</label>
    <label>Secondary phone<input name="secondaryPhone" type="tel" defaultValue={value("secondaryPhone", customer?.secondary_phone ?? "")}/>{fieldError("secondaryPhone")}</label>
    <label>Preferred contact<select name="preferredContactMethod" defaultValue={value("preferredContactMethod", customer?.preferred_contact_method ?? "email")}><option value="email">Email</option><option value="phone">Phone</option><option value="sms">SMS</option><option value="none">No preference</option></select></label>
    <label>Lead source<input name="leadSource" defaultValue={value("leadSource", customer?.lead_source ?? "")} placeholder="Referral, Google, repeat customer…"/></label>
    <label>Status<select name="isActive" defaultValue={value("isActive", String(customer?.is_active ?? true))}><option value="true">Active</option><option value="false">Inactive</option></select></label>
    <label className="crm-wide">Tags<input name="tags" defaultValue={value("tags", customer?.tags?.join(", ") ?? "")} placeholder="VIP, commercial, maintenance"/></label>
    <label className="crm-wide">Customer notes<textarea name="notes" rows={5} defaultValue={value("notes", customer?.notes ?? "")}/></label>
    {fieldError("duplicate")}
    <button className="sv-button" disabled={pending}>{pending ? "Saving…" : state.values?.confirmDuplicate === "true" ? "Create anyway" : submitLabel}</button>
  </form>;
}
