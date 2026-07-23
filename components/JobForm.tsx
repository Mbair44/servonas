"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import type { JobActionState } from "@/app/app/[businessSlug]/jobs/actions";
import { jobPriorities, jobStatuses, paymentStatuses } from "@/lib/jobValidation";

type Customer = { id: string; first_name: string; last_name: string; company_name?: string | null };
type Location = { id: string; customer_id: string; location_name: string; street_address: string; city: string; state: string };
type Service = { id: string; name: string; duration_minutes?: number | null };
type Technician = { id: string; display_name: string };
type Job = Record<string, string | number | null | undefined>;

export default function JobForm({
  action, customers, locations, services, technicians, job, submitLabel, defaultCustomerId = "",
}: {
  action: (state: JobActionState, formData: FormData) => Promise<JobActionState>;
  customers: Customer[]; locations: Location[]; services: Service[]; technicians: Technician[];
  job?: Job; submitLabel: string; defaultCustomerId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const initialCustomer = state.values?.customerId ?? String(job?.customer_id ?? defaultCustomerId);
  const [customerId, setCustomerId] = useState(initialCustomer);
  const requestKey = useRef(typeof crypto === "undefined" ? "" : crypto.randomUUID());
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const error = (name: string) => state.fieldErrors?.[name]
    ? <small className="crm-field-error">{state.fieldErrors[name]}</small> : null;
  const customerLocations = useMemo(
    () => locations.filter((location) => !customerId || location.customer_id === customerId),
    [locations, customerId],
  );
  return <form action={formAction} className="job-form">
    {state.error && <div className="workspace-notice error wide" role="alert">{state.error}</div>}
    {!job && <input type="hidden" name="requestKey" value={requestKey.current}/>}
    <label className="wide">Job title<input required name="title" defaultValue={value("title", String(job?.title ?? ""))} placeholder="AC repair, landscape cleanup, annual inspection…"/>{error("title")}</label>
    <label>Customer<select required name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name || `${customer.first_name} ${customer.last_name}`}</option>)}</select>{error("customerId")}</label>
    <label>Service location<select name="serviceLocationId" defaultValue={value("serviceLocationId", String(job?.service_location_id ?? ""))}><option value="">No saved location</option>{customerLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name} — {location.street_address}, {location.city}</option>)}</select>{error("serviceLocationId")}</label>
    <label>Service<select name="serviceId" defaultValue={value("serviceId", String(job?.service_id ?? ""))}><option value="">Custom work</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>{error("serviceId")}</label>
    <label>Primary technician<select name="technicianId" defaultValue={value("technicianId", String(job?.assigned_technician_id ?? ""))}><option value="">Unassigned</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.display_name}</option>)}</select>{error("technicianId")}</label>
    <label>Scheduled start<input name="startsAt" type="datetime-local" defaultValue={value("startsAt", String(job?.starts_at_local ?? ""))}/>{error("startsAt")}</label>
    <label>Scheduled end<input name="endsAt" type="datetime-local" defaultValue={value("endsAt", String(job?.ends_at_local ?? ""))}/></label>
    <label>Arrival window start<input name="arrivalWindowStart" type="datetime-local" defaultValue={value("arrivalWindowStart", String(job?.arrival_window_start_local ?? ""))}/></label>
    <label>Arrival window end<input name="arrivalWindowEnd" type="datetime-local" defaultValue={value("arrivalWindowEnd", String(job?.arrival_window_end_local ?? ""))}/></label>
    <label>Estimated duration (minutes)<input name="estimatedDurationMinutes" type="number" min="1" max="10080" defaultValue={value("estimatedDurationMinutes", String(job?.estimated_duration_minutes ?? ""))}/></label>
    <label>Priority<select name="priority" defaultValue={value("priority", String(job?.priority ?? "normal"))}>{jobPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>{error("priority")}</label>
    <label>Status<select name="status" defaultValue={value("status", String(job?.status ?? "draft"))}>{jobStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>{error("status")}</label>
    <label>Source<input name="source" defaultValue={value("source", String(job?.booking_source ?? "dashboard"))}/></label>
    <label>Subtotal<input name="subtotal" type="number" min="0" step="0.01" defaultValue={value("subtotal", String(job?.subtotal ?? 0))}/></label>
    <label>Tax<input name="taxAmount" type="number" min="0" step="0.01" defaultValue={value("taxAmount", String(job?.tax_amount ?? 0))}/></label>
    <label>Discount<input name="discountAmount" type="number" min="0" step="0.01" defaultValue={value("discountAmount", String(job?.discount_amount ?? 0))}/>{error("money")}</label>
    <label>Payment status<select name="paymentStatus" defaultValue={value("paymentStatus", String(job?.payment_status ?? "unpaid"))}>{paymentStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
    <label className="wide">Description<textarea name="description" rows={4} defaultValue={value("description", String(job?.description ?? ""))}/></label>
    <label className="wide">Customer-visible notes<textarea name="customerNotes" rows={3} defaultValue={value("customerNotes", String(job?.customer_notes ?? ""))}/></label>
    <label className="wide">Internal notes<textarea name="internalNotes" rows={3} defaultValue={value("internalNotes", String(job?.internal_notes ?? ""))}/></label>
    <button className="sv-button" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
  </form>;
}
