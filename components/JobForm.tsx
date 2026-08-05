"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { JobActionState } from "@/app/app/[businessSlug]/jobs/actions";
import { jobPriorities, jobStatuses, paymentStatuses } from "@/lib/jobValidation";

type Customer = { id: string; first_name: string; last_name: string; company_name?: string | null };
type Location = { id: string; customer_id: string; location_name: string; street_address: string; city: string; state: string; default_technician_id?:string|null };
type Service = { id: string; name: string; duration_minutes?: number | null };
type Technician = { id: string; preferred_name: string };
type PriorJob = {id:string;job_number:number;title:string;customer_id:string;starts_at:string|null};
type Job = Record<string, string | number | boolean | null | undefined>;

export default function JobForm({
  action, customers, locations, services, technicians, priorJobs=[], job, submitLabel, defaultCustomerId = "", defaultStartAt="", onCancel,
}: {
  action: (state: JobActionState, formData: FormData) => Promise<JobActionState>;
  customers: Customer[]; locations: Location[]; services: Service[]; technicians: Technician[];priorJobs?:PriorJob[];
  job?: Job; submitLabel: string; defaultCustomerId?: string; defaultStartAt?:string; onCancel?:()=>void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const initialCustomer = state.values?.customerId ?? String(job?.customer_id ?? defaultCustomerId);
  const [customerId, setCustomerId] = useState(initialCustomer);
  const initialLocation = state.values?.serviceLocationId ?? String(job?.service_location_id ?? "");
  const [locationId,setLocationId]=useState(initialLocation);
  const [serviceId,setServiceId]=useState(state.values?.serviceId??String(job?.service_id??""));
  const [technicianId,setTechnicianId]=useState(state.values?.technicianId??String(job?.assigned_technician_id??""));
  const [startsAt,setStartsAt]=useState(state.values?.startsAt??String(job?.starts_at_local??defaultStartAt));
  const [endsAt,setEndsAt]=useState(state.values?.endsAt??String(job?.ends_at_local??""));
  const technicianTouched=useRef(false);
  const initialCommitment=state.values?.scheduleCommitment??String(job?.schedule_commitment??"fixed");
  const [fixedTime,setFixedTime]=useState(initialCommitment!=="flexible");
  const [returnVisit,setReturnVisit]=useState(state.values?.isReturnVisit==="on"||job?.is_return_visit===true);
  const requestKey = useRef(typeof crypto === "undefined" ? "" : crypto.randomUUID());
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const error = (name: string) => state.fieldErrors?.[name]
    ? <small className="crm-field-error">{state.fieldErrors[name]}</small> : null;
  const customerLocations = useMemo(
    () => locations.filter((location) => !customerId || location.customer_id === customerId),
    [locations, customerId],
  );
  useEffect(()=>{
    if(customerLocations.length===1){
      setLocationId(customerLocations[0].id);
    }else if(locationId&&!customerLocations.some(location=>location.id===locationId)){
      setLocationId("");
    }
  },[customerLocations,locationId]);
  useEffect(()=>{
    if(job||technicianTouched.current||!customerId||!locationId||!serviceId)return;
    const location=customerLocations.find(item=>item.id===locationId);
    const suggested=location?.default_technician_id&&technicians.some(item=>item.id===location.default_technician_id)
      ?location.default_technician_id:technicians.length===1?technicians[0].id:"";
    if(suggested)setTechnicianId(suggested);
  },[customerId,customerLocations,job,locationId,serviceId,technicians]);
  useEffect(()=>{
    if(job||!startsAt||!serviceId)return;
    const duration=services.find(service=>service.id===serviceId)?.duration_minutes;
    if(!duration||duration<=0)return;
    const start=new Date(startsAt);
    if(Number.isNaN(start.getTime()))return;
    start.setMinutes(start.getMinutes()+duration);
    const pad=(value:number)=>String(value).padStart(2,"0");
    setEndsAt(`${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`);
  },[job,serviceId,services,startsAt]);
  return <form action={formAction} className={`job-form${onCancel?" job-drawer-form":""}`}>
    {state.error && <div className="workspace-notice error wide" role="alert">{state.error}</div>}
    {state.warning&&<div className="workspace-notice warning wide" role="alert"><strong>Scheduling notice</strong><p>{state.warning}</p><p>You can create this job anyway or cancel and return to the previous screen.</p><div className="job-warning-actions"><button className="sv-button" name="overrideMinimumNotice" value="true" disabled={pending}>{pending?"Creating…":"Create job anyway"}</button><button type="button" className="sv-button sv-secondary" onClick={onCancel??(()=>window.history.back())}>Cancel</button></div></div>}
    {!job && <input type="hidden" name="requestKey" value={requestKey.current}/>}
    <fieldset className="job-form-section job-details-section"><legend><i aria-hidden="true">◆</i><span><strong>Job details</strong><small>Choose the customer, location, service, and technician.</small></span></legend><div className="job-form-grid">
      <label className="wide">Job title<input required name="title" defaultValue={value("title", String(job?.title ?? ""))} placeholder="AC repair, landscape cleanup, annual inspection…"/>{error("title")}</label>
      <label>Customer<select required name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name || `${customer.first_name} ${customer.last_name}`}</option>)}</select>{error("customerId")}</label>
      <label>Service location<select name="serviceLocationId" value={locationId} onChange={event=>setLocationId(event.target.value)}><option value="">No saved location</option>{customerLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name} — {location.street_address}, {location.city}</option>)}</select>{error("serviceLocationId")}</label>
      <label>Service<select name="serviceId" value={serviceId} onChange={event=>setServiceId(event.target.value)}><option value="">Custom work</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>{error("serviceId")}</label>
      <label>Primary technician<select name="technicianId" value={technicianId} onChange={event=>{technicianTouched.current=true;setTechnicianId(event.target.value);}}><option value="">Unassigned</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.preferred_name}</option>)}</select>{error("technicianId")}</label>
    </div></fieldset>
    <fieldset className="job-form-section job-schedule-section"><legend><i aria-hidden="true">▦</i><span><strong>Schedule &amp; dispatch</strong><small>Set the appointment commitment, timing, and priority.</small></span></legend><div className="job-form-grid">
      <input type="hidden" name="scheduleCommitment" value={fixedTime?"fixed":"flexible"}/>
      <label className="wide job-time-commitment"><input type="checkbox" checked={fixedTime} onChange={event=>setFixedTime(event.target.checked)}/><span><strong>{fixedTime?"Appointment time is set":"Appointment time is flexible"}</strong><small>{fixedTime?"The technician must arrive at this time. Route calculation cannot move this stop.":"Route calculation may place this job anywhere on the selected service day."}</small></span></label>
      <label>{fixedTime?"Scheduled start":"Service day (time may move)"}<input name="startsAt" type="datetime-local" value={startsAt} onChange={event=>setStartsAt(event.target.value)}/>{error("startsAt")}</label>
      <label>Scheduled end<input name="endsAt" type="datetime-local" value={endsAt} onChange={event=>setEndsAt(event.target.value)}/></label>
      <label>Arrival window start<input disabled={!fixedTime} name="arrivalWindowStart" type="datetime-local" defaultValue={value("arrivalWindowStart", String(job?.arrival_window_start_local ?? ""))}/></label>
      <label>Arrival window end<input disabled={!fixedTime} name="arrivalWindowEnd" type="datetime-local" defaultValue={value("arrivalWindowEnd", String(job?.arrival_window_end_local ?? ""))}/></label>
      <label>Estimated duration (minutes)<input name="estimatedDurationMinutes" type="number" min="1" max="10080" defaultValue={value("estimatedDurationMinutes", String(job?.estimated_duration_minutes ?? ""))}/></label>
      <label>Priority<select name="priority" defaultValue={value("priority", String(job?.priority ?? "normal"))}>{jobPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>{error("priority")}</label>
      <label>Status<select name="status" defaultValue={value("status", String(job?.status ?? "draft"))}>{jobStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>{error("status")}</label>
      <label>Source<input name="source" defaultValue={value("source", String(job?.booking_source ?? "dashboard"))}/></label>
      <label className="wide job-return-visit"><input type="checkbox" name="isReturnVisit" checked={returnVisit} onChange={event=>setReturnVisit(event.target.checked)}/><span><strong>Mark as a return visit</strong><small>Use this for a callback or additional visit related to work already performed.</small></span></label>
      {returnVisit&&<><label className="wide">Original job <small>Optional</small><select name="returnVisitForJobId" defaultValue={value("returnVisitForJobId",String(job?.return_visit_for_job_id??""))}><option value="">Not linked to a specific job</option>{priorJobs.filter(item=>item.customer_id===customerId&&item.id!==job?.id).map(item=><option key={item.id} value={item.id}>#{item.job_number} · {item.title}{item.starts_at?` · ${new Date(item.starts_at).toLocaleDateString()}`:""}</option>)}</select>{error("returnVisitForJobId")}</label><label className="wide">Return-visit reason <small>Optional</small><textarea name="returnVisitReason" rows={2} maxLength={1000} defaultValue={value("returnVisitReason",String(job?.return_visit_reason??""))} placeholder="Warranty callback, issue continued, follow-up repair…"/></label></>}
    </div></fieldset>
    <fieldset className="job-form-section job-billing-section"><legend><i aria-hidden="true">$</i><span><strong>Billing</strong><small>Set the job value and current payment status.</small></span></legend><div className="job-form-grid">
      <label>Subtotal<input name="subtotal" type="number" min="0" step="0.01" defaultValue={value("subtotal", String(job?.subtotal ?? 0))}/></label>
      <label>Tax<input name="taxAmount" type="number" min="0" step="0.01" defaultValue={value("taxAmount", String(job?.tax_amount ?? 0))}/></label>
      <label>Discount<input name="discountAmount" type="number" min="0" step="0.01" defaultValue={value("discountAmount", String(job?.discount_amount ?? 0))}/>{error("money")}</label>
      <label>Payment status<select name="paymentStatus" defaultValue={value("paymentStatus", String(job?.payment_status ?? "unpaid"))}>{paymentStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
    </div></fieldset>
    <fieldset className="job-form-section job-notes-section"><legend><i aria-hidden="true">≡</i><span><strong>Work details &amp; notes</strong><small>Record the scope and choose what the customer can see.</small></span></legend><div className="job-form-grid">
      <label className="wide">Description<textarea name="description" rows={4} defaultValue={value("description", String(job?.description ?? ""))}/></label>
      <label className="wide">Customer-visible notes<textarea name="customerNotes" rows={3} defaultValue={value("customerNotes", String(job?.customer_notes ?? ""))}/></label>
      <label className="wide">Internal notes<textarea name="internalNotes" rows={3} defaultValue={value("internalNotes", String(job?.internal_notes ?? ""))}/></label>
    </div></fieldset>
    {!state.warning&&<footer className="job-form-footer">{onCancel&&<button type="button" className="sv-button sv-secondary" onClick={onCancel}>Cancel</button>}<button className="sv-button" disabled={pending}>{pending ? "Saving…" : submitLabel}</button></footer>}
  </form>;
}
