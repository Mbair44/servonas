"use client";

import {useCallback,useState} from "react";
import type {JobActionState} from "@/app/app/[businessSlug]/jobs/actions";
import JobForm from "./JobForm";
import {CustomerActionIcon} from "./CustomerActionIcon";
import {ManagementDrawer} from "./ManagementDrawer";

type Customer={id:string;first_name:string;last_name:string;company_name?:string|null};
type Location={id:string;customer_id:string;location_name:string;street_address:string;city:string;state:string};
type Service={id:string;name:string;duration_minutes?:number|null};
type Technician={id:string;preferred_name:string};

export function ScheduleServiceDrawer({customer,locations,services,technicians,action,menuItem=false,mode="schedule"}:{
 customer:Customer;locations:Location[];services:Service[];technicians:Technician[];
 action:(state:JobActionState,formData:FormData)=>Promise<JobActionState>;
 menuItem?:boolean;mode?:"schedule"|"job";
}){
 const [open,setOpen]=useState(false);
 const close=useCallback(()=>setOpen(false),[]);
 const title=mode==="job"?"Create job":"Schedule service";
 const description=mode==="job"?"Create a one-time job":"Schedule a visit for this customer";
 return <>
  <button type="button" className={menuItem?"customer-action-item":undefined} onClick={()=>setOpen(true)}>{menuItem?<><i className={`customer-action-icon ${mode}`}><CustomerActionIcon name={mode==="job"?"briefcase":"calendar"}/></i><span><strong>{title}</strong><small>{description}</small></span><b aria-hidden="true">›</b></>:<>▣ {title}</>}</button>
  <ManagementDrawer open={open} title={title} onDirty={()=>{}} onClose={close}>
   <JobForm action={action} customers={[customer]} locations={locations} services={services} technicians={technicians} submitLabel={title} defaultCustomerId={customer.id} onCancel={close}/>
  </ManagementDrawer>
 </>;
}
