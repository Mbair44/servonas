"use client";

import {useCallback,useState} from "react";
import {CustomerActionIcon} from "./CustomerActionIcon";
import {ManagementDrawer} from "./ManagementDrawer";

type Option={id:string;name:string};
export type EditableServicePlan={
 id:string;name:string;service_location_id:string;service_id:string;default_employee_id:string|null;
 start_date:string;end_date:string|null;first_recurring_date:string;cadence_interval:number;cadence_unit:string;
 default_duration_minutes:number;recurring_price:number;preferred_time_window:string;taxable:boolean;
};

export function ServicePlanEditDrawer({plan,locations,services,employees,updateAction,deleteAction,menuItem=false}:{
 plan:EditableServicePlan;locations:Option[];services:Option[];employees:Option[];
 updateAction:(formData:FormData)=>void|Promise<void>;deleteAction:(formData:FormData)=>void|Promise<void>;
 menuItem?:boolean;
}){
 const [open,setOpen]=useState(false);
 const close=useCallback(()=>setOpen(false),[]);
 return <>
  <button type="button" className={menuItem?"visit-menu-action":"service-plan-edit-trigger"} onClick={()=>setOpen(true)} aria-label={`Edit ${plan.name}`}>{menuItem&&<i><CustomerActionIcon name="repeat"/></i>}<span>Edit service plan</span></button>
  <ManagementDrawer open={open} title="Edit service plan" onDirty={()=>{}} onClose={close}>
   <form action={deleteAction} className="service-plan-delete-shortcut"><button className="service-plan-trash" aria-label={`Delete ${plan.name}`} title="Delete service plan" onClick={event=>{if(!window.confirm(`Delete ${plan.name}? This will cancel future recurring jobs.`))event.preventDefault();}}><CustomerActionIcon name="archive"/></button></form>
   <form action={updateAction} className="quick-employee-form service-plan-form edit-plan-form">
    <fieldset><legend>Plan details</legend>
     <label>Plan name<input name="name" required defaultValue={plan.name}/></label>
     <label>Service location<select name="serviceLocationId" required defaultValue={plan.service_location_id}>{locations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
     <label>Service type<select name="serviceId" required defaultValue={plan.service_id}>{services.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
     <div className="quick-form-grid"><label>Start date<input name="startDate" type="date" required defaultValue={plan.start_date}/></label><label>End date <small>Optional</small><input name="endDate" type="date" defaultValue={plan.end_date??""}/></label><label>First recurring service<input name="firstRecurringDate" type="date" required defaultValue={plan.first_recurring_date}/></label><label>Default technician<select name="employeeId" defaultValue={plan.default_employee_id??""}><option value="">Unassigned</option>{employees.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    </fieldset>
    <fieldset><legend>Cadence and pricing</legend>
     <div className="service-plan-cadence"><span>Repeat every</span><input name="intervalValue" type="number" min="1" max="120" required defaultValue={plan.cadence_interval}/><select name="intervalUnit" defaultValue={plan.cadence_unit}><option value="day">days</option><option value="week">weeks</option><option value="month">months</option><option value="year">years</option></select></div>
     <div className="quick-form-grid"><label>Duration (minutes)<input name="durationMinutes" type="number" min="1" max="10080" required defaultValue={plan.default_duration_minutes}/></label><label>Price per visit<input name="recurringPrice" type="number" min="0" step=".01" required defaultValue={plan.recurring_price}/></label><label>Preferred time<select name="preferredTimeWindow" defaultValue={plan.preferred_time_window}><option value="no_preference">No preference</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="08:00-10:00">8:00 AM–10:00 AM</option><option value="10:00-12:00">10:00 AM–12:00 PM</option></select></label><label className="drawer-check"><input type="checkbox" name="taxable" defaultChecked={plan.taxable}/>Taxable</label></div>
    </fieldset>
    <footer><button type="button" className="sv-button sv-secondary" onClick={close}>Cancel</button><button className="sv-button">Save service plan</button></footer>
   </form>
  </ManagementDrawer>
 </>;
}
