"use client";

import {useMemo,useState} from "react";
import {ManagementDrawer} from "./ManagementDrawer";
import {CustomerActionIcon} from "./CustomerActionIcon";
import {previewOccurrences,type RecurrenceUnit} from "@/lib/servicePlanRecurrence";

type Option={id:string;name:string};

export function ServicePlanDrawer({customerName,locations,services,employees,action,menuItem=false}:{
 customerName:string;locations:Option[];services:Option[];employees:Option[];
 action:(formData:FormData)=>void|Promise<void>;menuItem?:boolean;
}){
 const [open,setOpen]=useState(false);
 const [initial,setInitial]=useState(false);
 const [automatic,setAutomatic]=useState(false);
 const [customAnchor,setCustomAnchor]=useState(false);
 const [effective,setEffective]=useState("");
 const [serviceId,setServiceId]=useState("");
 const [unit,setUnit]=useState<RecurrenceUnit>("month");
 const [interval,setInterval]=useState(1);
 const [first,setFirst]=useState("");
 const serviceName=services.find(service=>service.id===serviceId)?.name;
 const generatedName=serviceName?`${serviceName} – ${customerName}`:`Service plan – ${customerName}`;
 const recurrenceAnchor=initial||customAnchor?first:effective;
 const preview=useMemo(()=>recurrenceAnchor?previewOccurrences(recurrenceAnchor,interval,unit,2):[],[recurrenceAnchor,interval,unit]);
 const preset=(amount:number,nextUnit:RecurrenceUnit)=>{setInterval(amount);setUnit(nextUnit);};

 return <><button className={menuItem?"customer-action-item":"sv-button"} type="button" onClick={()=>setOpen(true)}>{menuItem?<><i className="customer-action-icon recurring"><CustomerActionIcon name="repeat"/></i><span><strong>Add service plan <em>Recurring</em></strong><small>Set up recurring service</small></span><b aria-hidden="true">›</b></>:<>＋ Add service plan</>}</button>
 <ManagementDrawer open={open} title={generatedName} onDirty={()=>{}} onClose={()=>setOpen(false)} size="wide">
  <form action={action} className="quick-employee-form service-plan-form service-plan-create-form">
   <input type="hidden" name="name" value={generatedName}/>

   <fieldset className="service-plan-overview">
    <label>Customer<input value={customerName} readOnly/></label>
    <label>Service type <b>*</b><select name="serviceId" required value={serviceId} onChange={event=>setServiceId(event.target.value)}><option value="" disabled>Choose service</option>{services.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Service location <b>*</b><select name="serviceLocationId" required defaultValue=""><option value="" disabled>Choose location</option>{locations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Duration (minutes) <b>*</b><select name="durationMinutes" defaultValue="60" required><option value="30">30</option><option value="45">45</option><option value="60">60</option><option value="90">90</option><option value="120">120</option><option value="180">180</option></select></label>
    <label>Default technician<select name="employeeId" defaultValue=""><option value="">Unassigned</option>{employees.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Plan effective date <b>*</b><input name="startDate" type="date" required value={effective} onChange={event=>setEffective(event.target.value)}/></label>
    <label className="service-plan-end-date">End date <small>Optional</small><input name="endDate" type="date"/></label>
   </fieldset>

   <fieldset className="service-plan-initial">
    <label className="service-plan-switch"><input type="checkbox" name="initialServiceRequired" checked={initial} onChange={event=>setInitial(event.target.checked)}/><span>Includes initial service</span></label>
    {initial&&<div className="quick-form-grid"><label>Initial service price<input name="initialServicePrice" type="number" min="0" step=".01" defaultValue="0"/></label><label>Initial service date<input name="initialServiceDate" type="date" required/></label><label>Initial duration (minutes)<input name="initialServiceDuration" type="number" min="1" max="10080" defaultValue="90"/></label><label>Initial-service description<input name="initialServiceDescription"/></label></div>}
   </fieldset>

   <fieldset className="service-plan-section">
    <legend><span aria-hidden="true">▣</span> Cadence</legend>
    <div className="service-plan-cadence-row"><label>Repeat every<input name="intervalValue" type="number" min="1" max="120" value={interval} onChange={event=>setInterval(Number(event.target.value))}/></label><label><span className="sr-only">Cadence unit</span><select name="intervalUnit" value={unit} onChange={event=>setUnit(event.target.value as RecurrenceUnit)}><option value="day">Days</option><option value="week">Weeks</option><option value="month">Months</option><option value="year">Years</option></select></label><div className="service-plan-presets" aria-label="Quick cadence presets"><span>Quick presets</span><button type="button" onClick={()=>preset(1,"week")}>Weekly</button><button type="button" className={interval===1&&unit==="month"?"active":""} onClick={()=>preset(1,"month")}>Monthly</button><button type="button" onClick={()=>preset(3,"month")}>Quarterly</button><button type="button" onClick={()=>preset(2,"month")}>Every 2 Months</button></div></div>
    <div className="service-plan-toggle-row"><label className="service-plan-switch"><input type="checkbox" name="scheduleAutomatically" checked={automatic} onChange={event=>setAutomatic(event.target.checked)}/><span>Let Servonas choose the best day for the route</span></label><label className="service-plan-switch"><input type="checkbox" checked={customAnchor} onChange={event=>setCustomAnchor(event.target.checked)}/><span>Use a different recurring start date</span></label></div>
    {automatic&&<label className="service-plan-window">Scheduling window<select name="schedulingFlexDays" defaultValue="7"><option value="3">Within 3 days of due date</option><option value="7">Within 7 days of due date</option><option value="14">Within 14 days of due date</option><option value="30">Within 30 days of due date</option></select></label>}
    {initial||customAnchor?<label className="service-plan-anchor">{automatic?"Begin automatic scheduling on or after":"First recurring service date"}<input name="firstRecurringDate" type="date" required value={first} onChange={event=>setFirst(event.target.value)}/></label>:<input name="firstRecurringDate" type="hidden" value={effective}/>}
    <div className="service-plan-next"><span aria-hidden="true">▣</span><div><strong>{preview[0]?`Next service: ${preview[0]}`:"Choose an effective date to preview the next service"}</strong><small>{automatic?"Servonas can place the visit within the selected route window.":`Future visits are calculated from the ${customAnchor?"recurring start":"effective"} date.`}</small></div></div>
   </fieldset>

   <fieldset className="service-plan-section service-plan-pricing">
    <legend><span aria-hidden="true">$</span> Pricing &amp; billing</legend>
    <label>Price per visit <b>*</b><input name="recurringPrice" type="number" min="0" step=".01" defaultValue="0" required/></label>
    <label>Preferred time<select name="preferredTimeWindow" defaultValue="no_preference"><option value="no_preference">No preference</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="08:00-10:00">8:00 AM–10:00 AM</option><option value="10:00-12:00">10:00 AM–12:00 PM</option></select></label>
    <label className="service-plan-tax"><input type="checkbox" name="taxable"/> Taxable</label>
    <label className="service-plan-billing">Billing<select aria-label="Billing rule" defaultValue="after_each_completed_service"><option value="after_each_completed_service">Bill after each completed service</option></select><small>An invoice will be created after each visit is completed.</small></label>
   </fieldset>

   <footer><button type="button" className="sv-button sv-secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="sv-button">Create service plan</button></footer>
  </form>
 </ManagementDrawer></>;
}
