"use client";

import {useCallback,useState} from "react";
import {CustomerActionIcon} from "./CustomerActionIcon";
import {ManagementDrawer} from "./ManagementDrawer";
import {nextMonthlyDayAnchor,nextMonthlyWeekdayAnchor,type RecurrenceUnit} from "@/lib/servicePlanRecurrence";

type Option={id:string;name:string};
const weekdays=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export type EditableServicePlan={
 id:string;name:string;service_location_id:string;service_id:string;default_employee_id:string|null;
 start_date:string;end_date:string|null;first_recurring_date:string;cadence_interval:number;cadence_unit:string;
 default_duration_minutes:number;recurring_price:number;preferred_time_window:string;taxable:boolean;
 scheduling_mode?:"fixed_date"|"route_optimized";scheduling_flex_days?:number;
 auto_dispatch?:boolean;
};

export function ServicePlanEditDrawer({plan,locations,services,employees,updateAction,deleteAction,menuItem=false}:{
 plan:EditableServicePlan;locations:Option[];services:Option[];employees:Option[];
 updateAction:(formData:FormData)=>void|Promise<void>;deleteAction:(formData:FormData)=>void|Promise<void>;
 menuItem?:boolean;
}){
 const [open,setOpen]=useState(false);
 const [effective,setEffective]=useState(plan.start_date);
 const [customAnchor,setCustomAnchor]=useState(plan.first_recurring_date!==plan.start_date);
 const anchorDate=new Date(`${plan.first_recurring_date}T00:00:00Z`);
 const [unit,setUnit]=useState<RecurrenceUnit>(plan.cadence_unit==="month_weekday"?"month":plan.cadence_unit as RecurrenceUnit);
 const [monthlyMode,setMonthlyMode]=useState<"day"|"weekday">(plan.cadence_unit==="month_weekday"?"weekday":"day");
 const [monthDay,setMonthDay]=useState(anchorDate.getUTCDate()),[monthOrdinal,setMonthOrdinal]=useState(Math.min(4,Math.ceil(anchorDate.getUTCDate()/7))),[monthWeekday,setMonthWeekday]=useState(anchorDate.getUTCDay());
 const monthlyAnchor=effective?(monthlyMode==="day"?nextMonthlyDayAnchor(effective,monthDay):nextMonthlyWeekdayAnchor(effective,monthOrdinal,monthWeekday)):"";
 const submittedUnit=unit==="month"&&monthlyMode==="weekday"?"month_weekday":unit;
 const close=useCallback(()=>setOpen(false),[]);
 return <>
  <button type="button" className={menuItem?"visit-menu-action":"service-plan-edit-trigger"} onClick={()=>setOpen(true)} aria-label={`Edit ${plan.name}`}>{menuItem&&<i><CustomerActionIcon name="repeat"/></i>}<span>Edit service plan</span></button>
  <ManagementDrawer open={open} title="Edit service plan" onDirty={()=>{}} onClose={close} headerAction={
   <form action={deleteAction}><button className="service-plan-trash" aria-label={`Delete ${plan.name}`} title="Delete service plan" onClick={event=>{if(!window.confirm(`Delete ${plan.name}? This will cancel future recurring jobs.`))event.preventDefault();}}><CustomerActionIcon name="archive"/></button></form>
  }>
   <form action={updateAction} className="quick-employee-form service-plan-form edit-plan-form">
    <fieldset><legend>Plan details</legend>
     <label><span className="service-plan-readonly-title">Plan name <small>Read only</small></span><input className="service-plan-readonly-input" name="name" readOnly aria-readonly="true" aria-describedby="service-plan-name-help" value={plan.name}/><small id="service-plan-name-help" className="service-plan-readonly-help">Generated from the selected service and customer.</small></label>
     <div className="quick-form-grid"><label>Service location<select name="serviceLocationId" required defaultValue={plan.service_location_id}>{locations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
     <label>Service type<select name="serviceId" required defaultValue={plan.service_id}>{services.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
     <div className="quick-form-grid"><label>Plan effective date<input name="startDate" type="date" required value={effective} onChange={event=>setEffective(event.target.value)}/></label><label>End date <small>Optional</small><input name="endDate" type="date" defaultValue={plan.end_date??""}/></label><label>Default technician<select name="employeeId" defaultValue={plan.default_employee_id??""}><option value="">Unassigned</option>{employees.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
     {unit!=="month"&&<label className="drawer-check"><input type="checkbox" checked={customAnchor} onChange={event=>setCustomAnchor(event.target.checked)}/>Use a different recurring start date</label>}
     {unit==="month"?<input name="firstRecurringDate" type="hidden" value={monthlyAnchor}/>:customAnchor?<label>First recurring service date<input name="firstRecurringDate" type="date" required defaultValue={plan.first_recurring_date}/></label>:<input name="firstRecurringDate" type="hidden" value={effective}/>} 
     <label className="drawer-check"><input type="checkbox" name="scheduleAutomatically" defaultChecked={plan.scheduling_mode==="route_optimized"}/>Let Servonas choose the best service day for the route</label>
     <label className="drawer-check"><input type="checkbox" name="autoDispatch" defaultChecked={plan.auto_dispatch}/>Automatically dispatch assigned jobs on the appointment day</label>
     <label>Automatic scheduling window<select name="schedulingFlexDays" defaultValue={plan.scheduling_flex_days??7}><option value="3">Within 3 days</option><option value="7">Within 7 days</option><option value="14">Within 14 days</option><option value="30">Within 30 days</option></select></label>
    </fieldset>
    <fieldset><legend>Cadence and pricing</legend>
     <input type="hidden" name="intervalUnit" value={submittedUnit}/><div className="service-plan-cadence"><span>Repeat every</span><input name="intervalValue" type="number" min="1" max="120" required defaultValue={plan.cadence_interval}/><select value={unit} onChange={event=>setUnit(event.target.value as RecurrenceUnit)}><option value="day">days</option><option value="week">weeks</option><option value="month">months</option><option value="year">years</option></select></div>
     {unit==="month"&&<div className="service-plan-monthly-pattern"><label>Repeat by<select value={monthlyMode} onChange={event=>setMonthlyMode(event.target.value as "day"|"weekday")}><option value="day">Day of the month</option><option value="weekday">Day of the week</option></select></label>{monthlyMode==="day"?<label>Day<select value={monthDay} onChange={event=>setMonthDay(Number(event.target.value))}>{Array.from({length:31},(_,index)=>index+1).map(day=><option value={day} key={day}>{day}</option>)}</select></label>:<><label>Week<select value={monthOrdinal} onChange={event=>setMonthOrdinal(Number(event.target.value))}><option value="1">First</option><option value="2">Second</option><option value="3">Third</option><option value="4">Fourth</option></select></label><label>Weekday<select value={monthWeekday} onChange={event=>setMonthWeekday(Number(event.target.value))}>{weekdays.map((day,index)=><option value={index} key={day}>{day}</option>)}</select></label></>}</div>}
     <div className="quick-form-grid"><label>Duration (minutes)<input name="durationMinutes" type="number" min="1" max="10080" required defaultValue={plan.default_duration_minutes}/></label><label>Price per visit<input name="recurringPrice" type="number" min="0" step=".01" required defaultValue={plan.recurring_price}/></label><label>Preferred time<select name="preferredTimeWindow" defaultValue={plan.preferred_time_window}><option value="no_preference">No preference</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="08:00-10:00">8:00 AM–10:00 AM</option><option value="10:00-12:00">10:00 AM–12:00 PM</option></select></label><label className="drawer-check"><input type="checkbox" name="taxable" defaultChecked={plan.taxable}/>Taxable</label></div>
    </fieldset>
    <footer>
     <button
      className="service-plan-footer-delete"
      formAction={deleteAction}
      formNoValidate
      aria-label={`Delete ${plan.name}`}
      title="Delete service plan"
      onClick={event=>{if(!window.confirm(`Delete ${plan.name}? This will cancel future recurring jobs.`))event.preventDefault();}}
     ><CustomerActionIcon name="archive"/><span>Delete</span></button>
     <button type="button" className="sv-button sv-secondary" onClick={close}>Cancel</button>
     <button className="sv-button">Save service plan</button>
    </footer>
   </form>
  </ManagementDrawer>
 </>;
}
