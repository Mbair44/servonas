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
    <label><span className="crm-label-title">First name <b aria-hidden="true">*</b><span className="sr-only">(required)</span></span><input name="firstName" required aria-required="true" maxLength={100} defaultValue={value("firstName", customer?.first_name ?? "")}/>{fieldError("firstName")}</label>
    <label><span className="crm-label-title">Last name <small>Optional</small></span><input name="lastName" maxLength={100} defaultValue={value("lastName", customer?.last_name ?? "")}/></label>
    <label><span className="crm-label-title">Company <small>Optional</small></span><input name="companyName" maxLength={200} defaultValue={value("companyName", customer?.company_name ?? "")}/></label>
    <label><span className="crm-label-title">Email <b aria-hidden="true">*</b><span className="sr-only">(required)</span></span><input name="email" type="email" autoComplete="email" required aria-required="true" defaultValue={value("email", customer?.email ?? "")}/>{fieldError("email")}</label>
    <label><span className="crm-label-title">Primary phone <b aria-hidden="true">*</b><span className="sr-only">(required)</span></span><input name="phone" type="tel" autoComplete="tel" required aria-required="true" defaultValue={value("phone", customer?.phone ?? "")}/>{fieldError("phone")}</label>
    <label><span className="crm-label-title">Secondary phone <small>Optional</small></span><input name="secondaryPhone" type="tel" defaultValue={value("secondaryPhone", customer?.secondary_phone ?? "")}/>{fieldError("secondaryPhone")}</label>
    <label><span className="crm-label-title">Preferred contact</span><select name="preferredContactMethod" defaultValue={value("preferredContactMethod", customer?.preferred_contact_method ?? "email")}><option value="email">Email</option><option value="phone">Phone</option><option value="sms">SMS</option><option value="none">No preference</option></select></label>
    <label><span className="crm-label-title">Lead source</span><input name="leadSource" defaultValue={value("leadSource", customer?.lead_source ?? "")} placeholder="Referral, Google, repeat customer…"/></label>
    <label><span className="crm-label-title">Status</span><select name="isActive" defaultValue={value("isActive", String(customer?.is_active ?? true))}><option value="true">Active</option><option value="false">Inactive</option></select></label>
    <label className="crm-wide"><span className="crm-label-title">Tags <small>Optional</small></span><input name="tags" defaultValue={value("tags", customer?.tags?.join(", ") ?? "")} placeholder="VIP, commercial, maintenance"/></label>
    <label className="crm-wide"><span className="crm-label-title">Customer notes <small>Optional</small></span><textarea name="notes" rows={3} defaultValue={value("notes", customer?.notes ?? "")}/></label>
    {fieldError("duplicate")}
    <button className="sv-button" disabled={pending}>{pending ? "Saving…" : state.values?.confirmDuplicate === "true" ? "Create anyway" : submitLabel}</button>
  </form>;
}
