"use client";

import {useCallback,useState} from "react";
import type {JobActionState} from "@/app/app/[businessSlug]/jobs/actions";
import JobForm from "./JobForm";
import {ManagementDrawer} from "./ManagementDrawer";

type Customer={id:string;first_name:string;last_name:string;company_name?:string|null};
type Location={id:string;customer_id:string;location_name:string;street_address:string;city:string;state:string;default_technician_id?:string|null};
type Service={id:string;name:string;duration_minutes?:number|null};
type Technician={id:string;preferred_name:string};
type PriorJob={id:string;job_number:number;title:string;customer_id:string;starts_at:string|null};

export function JobCreateDrawer({customers,locations,services,technicians,priorJobs,action,defaultCustomerId="",defaultStartAt="",label="Add job",className="sv-button",autoOpen=false,icon=true}:{
 customers:Customer[];locations:Location[];services:Service[];technicians:Technician[];priorJobs:PriorJob[];
 action:(state:JobActionState,formData:FormData)=>Promise<JobActionState>;
 defaultCustomerId?:string;defaultStartAt?:string;label?:string;className?:string;autoOpen?:boolean;icon?:boolean;
}){
 const [open,setOpen]=useState(autoOpen);
 const close=useCallback(()=>setOpen(false),[]);
 return <>
  <button type="button" className={className} onClick={()=>setOpen(true)}>{icon&&<span aria-hidden="true">＋</span>}{label}</button>
  <ManagementDrawer open={open} size="wide" title="Add job" subtitle="Create, schedule, and assign a job without leaving this page." onDirty={()=>{}} onClose={close}>
   <JobForm action={action} customers={customers} locations={locations} services={services} technicians={technicians} priorJobs={priorJobs} submitLabel="Create job" defaultCustomerId={defaultCustomerId} defaultStartAt={defaultStartAt} onCancel={close}/>
  </ManagementDrawer>
 </>;
}
