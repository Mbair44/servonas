"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobActionState } from "@/app/app/[businessSlug]/jobs/actions";
import { jobPriorities, jobStatuses, paymentStatuses } from "@/lib/jobValidation";

type Customer = { id: string; first_name: string; last_name: string; company_name?: string | null };
type Location = { id: string; customer_id: string; location_name: string; street_address: string; city: string; state: string; default_technician_id?:string|null };
type Service = { id: string; name: string; duration_minutes?: number | null };
type Technician = { id: string; preferred_name: string };
type PriorJob = {id:string;job_number:number;title:string;customer_id:string;starts_at:string|null};
type Job = Record<string, string | number | boolean | null | undefined>;

function JobSectionIcon({name}:{name:"details"|"schedule"|"billing"|"notes"}){
 const paths={
  details:<><path d="M9 5h6"/><path d="M9 9h6"/><path d="M9 13h4"/><path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></>,
  schedule:<><path d="M7 2v3M17 2v3M3 9h18"/><rect x="3" y="4" width="18" height="17" rx="2"/><path d="m8 15 2.5 2.5L16 12"/></>,
  billing:<><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 9h19M7 15h3"/></>,
  notes:<><path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-1-1.73V5a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h6"/></>,
 };
 return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function JobForm({
  id, action, customers, locations, services, technicians, priorJobs=[], job, submitLabel, defaultCustomerId = "", defaultStartAt="", source="dashboard", onCancel,
}: {
  id?:string;
  action: (state: JobActionState, formData: FormData) => Promise<JobActionState>;
  customers: Customer[]; locations: Location[]; services: Service[]; technicians: Technician[];priorJobs?:PriorJob[];
  job?: Job; submitLabel: string; defaultCustomerId?: string; defaultStartAt?:string;source?:string; onCancel?:()=>void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const initialValues = useMemo(()=>({
    requestKey:"",
    status:String(job?.status ?? "draft"),
    source:String(job?.booking_source ?? source),
    title:String(job?.title ?? ""),
    customerId:String(job?.customer_id ?? defaultCustomerId),
    serviceLocationId:String(job?.service_location_id ?? ""),
    serviceId:String(job?.service_id ?? ""),
    technicianId:String(job?.assigned_technician_id ?? ""),
    scheduleCommitment:String(job?.schedule_commitment ?? "fixed"),
    startsAt:String(job?.starts_at_local ?? defaultStartAt),
    endsAt:String(job?.ends_at_local ?? ""),
    arrivalWindowStart:String(job?.arrival_window_start_local ?? ""),
    arrivalWindowEnd:String(job?.arrival_window_end_local ?? ""),
    estimatedDurationMinutes:String(job?.estimated_duration_minutes ?? ""),
    priority:String(job?.priority ?? "normal"),
    subtotal:String(job?.subtotal ?? 0),
    taxAmount:String(job?.tax_amount ?? 0),
    discountAmount:String(job?.discount_amount ?? 0),
    paymentStatus:String(job?.payment_status ?? "unpaid"),
    description:String(job?.description ?? ""),
    customerNotes:String(job?.customer_notes ?? ""),
    internalNotes:String(job?.internal_notes ?? ""),
    returnVisitForJobId:String(job?.return_visit_for_job_id ?? ""),
    returnVisitReason:String(job?.return_visit_reason ?? ""),
    isReturnVisit:job?.is_return_visit===true?"on":"",
  }),[defaultCustomerId,defaultStartAt,job,source]);
  const [formValues,setFormValues]=useState<Record<string,string>>({...initialValues});
  useEffect(()=>{if(state.values)setFormValues(current=>({...current,...state.values}));},[state.values]);
  const updateValue=(name:string,value:string)=>setFormValues(current=>({...current,[name]:value}));
  const initialCustomer = state.values?.customerId ?? String(job?.customer_id ?? defaultCustomerId);
  const [customerId, setCustomerId] = useState(initialCustomer);
  const initialLocation = state.values?.serviceLocationId ?? String(job?.service_location_id ?? "");
  const [locationId,setLocationId]=useState(initialLocation);
  const [serviceId,setServiceId]=useState(state.values?.serviceId??String(job?.service_id??""));
  const [technicianId,setTechnicianId]=useState(state.values?.technicianId??String(job?.assigned_technician_id??""));
  const isCreate=!job;
  const [startsAt,setStartsAt]=useState(state.values?.startsAt??String(job?.starts_at_local??defaultStartAt));
  const [endsAt,setEndsAt]=useState(state.values?.endsAt??String(job?.ends_at_local??""));
  const [duration,setDuration]=useState(state.values?.estimatedDurationMinutes??String(job?.estimated_duration_minutes??""));
  const [arrivalPreset,setArrivalPreset]=useState(isCreate?"exact":"custom");
  const [customArrivalStart,setCustomArrivalStart]=useState(state.values?.arrivalWindowStart??String(job?.arrival_window_start_local??""));
  const [customArrivalEnd,setCustomArrivalEnd]=useState(state.values?.arrivalWindowEnd??String(job?.arrival_window_end_local??""));
  const [arrivalStart,setArrivalStart]=useState(customArrivalStart),[arrivalEnd,setArrivalEnd]=useState(customArrivalEnd);
  const technicianTouched=useRef(false);
  const initialCommitment=state.values?.scheduleCommitment??String(job?.schedule_commitment??"fixed");
  const [fixedTime,setFixedTime]=useState(initialCommitment!=="flexible");
  const [returnVisit,setReturnVisit]=useState(state.values?.isReturnVisit==="on"||job?.is_return_visit===true);
  const requestKey = useRef(typeof crypto === "undefined" ? "" : crypto.randomUUID());
  const value = useCallback((name: string, fallback = "") => formValues[name] ?? fallback,[formValues]);
  const [subtotal,setSubtotal]=useState(value("subtotal",String(job?.subtotal??0))),[tax,setTax]=useState(value("taxAmount",String(job?.tax_amount??0))),[discount,setDiscount]=useState(value("discountAmount",String(job?.discount_amount??0)));
  const error = (name: string) => state.fieldErrors?.[name]
    ? <small className="crm-field-error">{state.fieldErrors[name]}</small> : null;
  const customerLocations = useMemo(
    () => locations.filter((location) => !customerId || location.customer_id === customerId),
    [locations, customerId],
  );
  useEffect(()=>{
    setCustomerId(value("customerId",String(job?.customer_id ?? defaultCustomerId)));
    setLocationId(value("serviceLocationId",String(job?.service_location_id ?? "")));
    setServiceId(value("serviceId",String(job?.service_id ?? "")));
    setTechnicianId(value("technicianId",String(job?.assigned_technician_id ?? "")));
    setStartsAt(value("startsAt",String(job?.starts_at_local ?? defaultStartAt)));
    setEndsAt(value("endsAt",String(job?.ends_at_local ?? "")));
    setDuration(value("estimatedDurationMinutes",String(job?.estimated_duration_minutes ?? "")));
    setCustomArrivalStart(value("arrivalWindowStart",String(job?.arrival_window_start_local ?? "")));
    setCustomArrivalEnd(value("arrivalWindowEnd",String(job?.arrival_window_end_local ?? "")));
    setSubtotal(value("subtotal",String(job?.subtotal ?? 0)));
    setTax(value("taxAmount",String(job?.tax_amount ?? 0)));
    setDiscount(value("discountAmount",String(job?.discount_amount ?? 0)));
    setReturnVisit(value("isReturnVisit",job?.is_return_visit===true?"on":"")==="on");
  },[defaultCustomerId,defaultStartAt,job,state.values,value]);
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
    if(job||duration||!serviceId)return;
    const serviceDuration=services.find(service=>service.id===serviceId)?.duration_minutes;
    if(serviceDuration&&serviceDuration>0)setDuration(String(serviceDuration));
  },[duration,job,serviceId,services]);
  useEffect(()=>{
    if(job||!startsAt||!duration)return;
    const durationMinutes=Number(duration);
    if(!Number.isFinite(durationMinutes)||durationMinutes<=0)return;
    const start=new Date(startsAt);
    if(Number.isNaN(start.getTime()))return;
    start.setMinutes(start.getMinutes()+durationMinutes);
    const pad=(value:number)=>String(value).padStart(2,"0");
    const nextEnd=`${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
    setEndsAt(nextEnd);
    updateValue("endsAt",nextEnd);
  },[duration,job,startsAt]);
  useEffect(()=>{
    if(!isCreate||!startsAt){if(isCreate){setArrivalStart("");setArrivalEnd("");}return;}
    if(arrivalPreset==="custom"){setArrivalStart(customArrivalStart);setArrivalEnd(customArrivalEnd);return;}
    const start=new Date(startsAt);if(Number.isNaN(start.getTime()))return;
    const pad=(number:number)=>String(number).padStart(2,"0"),format=(date:Date)=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const from=new Date(start),to=new Date(start);
    if(arrivalPreset==="30"){from.setMinutes(from.getMinutes()-30);to.setMinutes(to.getMinutes()+30);}
    else if(arrivalPreset==="60"){from.setHours(from.getHours()-1);to.setHours(to.getHours()+1);}
    else if(arrivalPreset==="120"){from.setHours(from.getHours()-2);to.setHours(to.getHours()+2);}
    else if(arrivalPreset==="morning"){from.setHours(8,0,0,0);to.setHours(12,0,0,0);}
    else if(arrivalPreset==="afternoon"){from.setHours(12,0,0,0);to.setHours(17,0,0,0);}
    setArrivalStart(format(from));setArrivalEnd(format(to));
  },[arrivalPreset,customArrivalEnd,customArrivalStart,isCreate,startsAt]);
  const total=Math.max(0,(Number(subtotal)||0)+(Number(tax)||0)-(Number(discount)||0));
  return <form id={id} action={formAction} className={`job-form${onCancel?" job-drawer-form":""}`}>
    {state.error && <div className="workspace-notice error wide" role="alert">{state.error}</div>}
    {state.warning&&<div className="workspace-notice warning wide" role="alert"><strong>Scheduling notice</strong><p>{state.warning}</p><p>You can create this job anyway or cancel and return to the previous screen.</p><div className="job-warning-actions"><button className="sv-button" name="overrideMinimumNotice" value="true" disabled={pending}>{pending?"Creating…":"Create job anyway"}</button><button type="button" className="sv-button sv-secondary" onClick={onCancel??(()=>window.history.back())}>Cancel</button></div></div>}
    {!job && <input type="hidden" name="requestKey" value={requestKey.current}/>} 
    {isCreate&&<><input type="hidden" name="status" value="draft"/><input type="hidden" name="source" value={source}/></>}
    <fieldset className="job-form-section job-details-section"><legend><i><JobSectionIcon name="details"/></i><span><strong>Job details</strong><small>Add the basics about this job.</small></span></legend><div className="job-form-grid">
      <label className="wide">Job title <b className="required-mark">Required</b><input required name="title" value={value("title", String(job?.title ?? ""))} onChange={event=>updateValue("title",event.target.value)} placeholder="AC repair, landscape cleanup, annual inspection…"/>{error("title")}</label>
      <label>Customer <b className="required-mark">Required</b><select required name="customerId" value={customerId} onChange={(event) => {setCustomerId(event.target.value);updateValue("customerId",event.target.value);}}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name || `${customer.first_name} ${customer.last_name}`}</option>)}</select>{error("customerId")}</label>
      <label>Service location<select name="serviceLocationId" value={locationId} onChange={event=>{setLocationId(event.target.value);updateValue("serviceLocationId",event.target.value);}}><option value="">No saved location</option>{customerLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name} — {location.street_address}, {location.city}</option>)}</select>{error("serviceLocationId")}</label>
      <label>Service<select name="serviceId" value={serviceId} onChange={event=>{setServiceId(event.target.value);updateValue("serviceId",event.target.value);}}><option value="">Custom work</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>{error("serviceId")}</label>
      <label>Primary technician<select name="technicianId" value={technicianId} onChange={event=>{technicianTouched.current=true;setTechnicianId(event.target.value);updateValue("technicianId",event.target.value);}}><option value="">Unassigned</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.preferred_name}</option>)}</select>{error("technicianId")}</label>
    </div></fieldset>
    <fieldset className="job-form-section job-schedule-section"><legend><i><JobSectionIcon name="schedule"/></i><span><strong>Schedule &amp; dispatch</strong><small>Set appointment time, arrival flexibility, and priority.</small></span></legend><div className="job-form-grid">
      <input type="hidden" name="scheduleCommitment" value={isCreate?(arrivalPreset==="exact"?"fixed":"flexible"):(fixedTime?"fixed":"flexible")}/>
      {isCreate?<><input type="hidden" name="arrivalWindowStart" value={arrivalStart}/><input type="hidden" name="arrivalWindowEnd" value={arrivalEnd}/></>:<label className="wide job-time-commitment"><input type="checkbox" checked={fixedTime} onChange={event=>setFixedTime(event.target.checked)}/><span><strong>{fixedTime?"Appointment time is set":"Appointment time is flexible"}</strong><small>{fixedTime?"The technician must arrive at this time. Route calculation cannot move this stop.":"Route calculation may place this job anywhere on the selected service day."}</small></span></label>}
      <label>Scheduled start<input name="startsAt" type="datetime-local" aria-invalid={state.fieldErrors?.startsAt?"true":undefined} value={startsAt} onChange={event=>{setStartsAt(event.target.value);updateValue("startsAt",event.target.value);}}/>{error("startsAt")}</label>
      {isCreate&&<label>Scheduled end<input name="endsAt" type="datetime-local" aria-invalid={state.fieldErrors?.endsAt?"true":undefined} value={endsAt} onChange={event=>{setEndsAt(event.target.value);updateValue("endsAt",event.target.value);}}/>{error("endsAt")}<small>Required when you set a scheduled start.</small></label>}
      {isCreate?<label>Arrival window<select aria-invalid={state.fieldErrors?.arrivalWindowStart||state.fieldErrors?.arrivalWindowEnd?"true":undefined} value={arrivalPreset} onChange={event=>setArrivalPreset(event.target.value)}><option value="exact">Exact appointment time</option><option value="30">± 30 minutes</option><option value="60">± 1 hour</option><option value="120">± 2 hours</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="custom">Custom</option></select><small>{arrivalPreset==="exact"?"Route calculation cannot move this stop.":"Routing can place the visit within this window."}</small></label>:<><label>Scheduled end<input name="endsAt" type="datetime-local" aria-invalid={state.fieldErrors?.endsAt?"true":undefined} value={endsAt} onChange={event=>{setEndsAt(event.target.value);updateValue("endsAt",event.target.value);}}/>{error("endsAt")}</label><label>Arrival window start<input disabled={!fixedTime} name="arrivalWindowStart" type="datetime-local" aria-invalid={state.fieldErrors?.arrivalWindowStart?"true":undefined} value={value("arrivalWindowStart", String(job?.arrival_window_start_local ?? ""))} onChange={event=>updateValue("arrivalWindowStart",event.target.value)}/>{error("arrivalWindowStart")}</label><label>Arrival window end<input disabled={!fixedTime} name="arrivalWindowEnd" type="datetime-local" aria-invalid={state.fieldErrors?.arrivalWindowEnd?"true":undefined} value={value("arrivalWindowEnd", String(job?.arrival_window_end_local ?? ""))} onChange={event=>updateValue("arrivalWindowEnd",event.target.value)}/>{error("arrivalWindowEnd")}</label></>}
      {isCreate&&arrivalPreset==="custom"&&<div className="job-custom-window wide"><label>Window start<input type="datetime-local" value={customArrivalStart} onChange={event=>{setCustomArrivalStart(event.target.value);updateValue("arrivalWindowStart",event.target.value);}}/></label><label>Window end<input type="datetime-local" value={customArrivalEnd} onChange={event=>{setCustomArrivalEnd(event.target.value);updateValue("arrivalWindowEnd",event.target.value);}}/></label></div>}
      <label>Estimated duration (minutes)<input name="estimatedDurationMinutes" type="number" min="1" max="10080" value={duration} onChange={event=>{setDuration(event.target.value);updateValue("estimatedDurationMinutes",event.target.value);}} placeholder="60"/></label>
      <label>Priority<select name="priority" value={value("priority", String(job?.priority ?? "normal"))} onChange={event=>updateValue("priority",event.target.value)}>{jobPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>{error("priority")}</label>
      {!isCreate&&<><label>Status<select name="status" value={value("status", String(job?.status ?? "draft"))} onChange={event=>updateValue("status",event.target.value)}>{jobStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>{error("status")}</label><label>Source<input name="source" value={value("source", String(job?.booking_source ?? "dashboard"))} onChange={event=>updateValue("source",event.target.value)}/></label></>}
      <label className="wide job-return-visit"><input type="checkbox" name="isReturnVisit" checked={returnVisit} onChange={event=>setReturnVisit(event.target.checked)}/><span><strong>Mark as a return visit</strong><small>Use this for a callback or additional visit related to work already performed.</small></span></label>
      {returnVisit&&<><label className="wide">Original job <small>Optional</small><select name="returnVisitForJobId" value={value("returnVisitForJobId",String(job?.return_visit_for_job_id??""))} onChange={event=>updateValue("returnVisitForJobId",event.target.value)}><option value="">Not linked to a specific job</option>{priorJobs.filter(item=>item.customer_id===customerId&&item.id!==job?.id).map(item=><option key={item.id} value={item.id}>#{item.job_number} · {item.title}{item.starts_at?` · ${new Date(item.starts_at).toLocaleDateString()}`:""}</option>)}</select>{error("returnVisitForJobId")}</label><label className="wide">Return-visit reason <small>Optional</small><textarea name="returnVisitReason" rows={2} maxLength={1000} value={value("returnVisitReason",String(job?.return_visit_reason??""))} onChange={event=>updateValue("returnVisitReason",event.target.value)} placeholder="Warranty callback, issue continued, follow-up repair…"/></label></>}
    </div></fieldset>
    <fieldset className="job-form-section job-billing-section"><legend><i><JobSectionIcon name="billing"/></i><span><strong>Billing</strong><small>Set the job value and payment status.</small></span></legend><div className="job-form-grid job-billing-grid">
      <label>Subtotal<input name="subtotal" type="number" min="0" step="0.01" value={subtotal} onChange={event=>setSubtotal(event.target.value)}/></label>
      <label>Tax<input name="taxAmount" type="number" min="0" step="0.01" value={tax} onChange={event=>setTax(event.target.value)}/></label>
      <label>Discount<input name="discountAmount" type="number" min="0" step="0.01" value={discount} onChange={event=>setDiscount(event.target.value)}/>{error("money")}</label>
      <div className="job-calculated-total"><span>Total</span><strong>{new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(total)}</strong></div>
      <label>Payment status<select name="paymentStatus" value={value("paymentStatus", String(job?.payment_status ?? "unpaid"))} onChange={event=>updateValue("paymentStatus",event.target.value)}>{paymentStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
    </div></fieldset>
    <fieldset className="job-form-section job-notes-section"><legend><i><JobSectionIcon name="notes"/></i><span><strong>Notes</strong><small>Record the scope and choose what the customer can see.</small></span></legend><div className="job-form-grid job-notes-grid">
      <label>Description<textarea name="description" rows={3} value={value("description", String(job?.description ?? ""))} onChange={event=>updateValue("description",event.target.value)} placeholder="What work will be done?"/></label>
      <label>Customer-visible notes<textarea name="customerNotes" rows={3} value={value("customerNotes", String(job?.customer_notes ?? ""))} onChange={event=>updateValue("customerNotes",event.target.value)} placeholder="What the customer will see"/></label>
      <label>Internal notes<textarea name="internalNotes" rows={3} value={value("internalNotes", String(job?.internal_notes ?? ""))} onChange={event=>updateValue("internalNotes",event.target.value)} placeholder="Only your team will see"/></label>
    </div></fieldset>
    {!state.warning&&(!isCreate||!onCancel)&&<footer className="job-form-footer">{onCancel&&<button type="button" className="sv-button sv-secondary" onClick={onCancel}>Cancel</button>}<button className="sv-button" disabled={pending}>{pending ? "Saving…" : submitLabel}</button></footer>}
  </form>;
}
