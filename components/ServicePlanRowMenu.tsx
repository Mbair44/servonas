"use client";

import {useRef} from "react";
import {ServicePlanEditDrawer,type EditableServicePlan} from "./ServicePlanEditDrawer";

type Option={id:string;name:string};

export function ServicePlanRowMenu({plan,locations,services,employees,skipAction,updateAction,deleteAction}:{
 plan:EditableServicePlan;
 locations:Option[];
 services:Option[];
 employees:Option[];
 skipAction:(formData:FormData)=>void|Promise<void>;
 updateAction:(formData:FormData)=>void|Promise<void>;
 deleteAction:(formData:FormData)=>void|Promise<void>;
}){
 const menu=useRef<HTMLDetailsElement>(null);
 const close=()=>menu.current?.removeAttribute("open");
 return <details ref={menu} className="visit-actions-menu service-plan-row-menu">
  <summary aria-label={`Actions for ${plan.name}`}>⋮</summary>
  <div>
   <form action={skipAction}><button onClick={event=>{if(!window.confirm(`Skip the next service for ${plan.name}?`))event.preventDefault();else close();}}>↷ Skip next service</button></form>
   <span onClick={close}><ServicePlanEditDrawer menuItem plan={plan} locations={locations} services={services} employees={employees} updateAction={updateAction} deleteAction={deleteAction}/></span>
   <form action={deleteAction}><button className="danger" onClick={event=>{if(!window.confirm(`Delete ${plan.name}? This will cancel future recurring jobs.`))event.preventDefault();else close();}}>Delete service plan</button></form>
  </div>
 </details>;
}
