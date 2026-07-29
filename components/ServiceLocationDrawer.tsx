"use client";

import {useCallback,useState,type ReactNode} from "react";
import type {CrmActionState} from "@/app/app/[businessSlug]/customers/actions";
import {ManagementDrawer} from "./ManagementDrawer";
import ServiceLocationForm from "./ServiceLocationForm";

type Location=Record<string,string|boolean|number|null|undefined>;

export function ServiceLocationDrawer({
 title,
 trigger,
 action,
 location,
 googleMapsApiKey,
 triggerClassName,
}:{
 title:string;
 trigger:ReactNode;
 action:(state:CrmActionState,formData:FormData)=>Promise<CrmActionState>;
 location?:Location;
 googleMapsApiKey?:string;
 triggerClassName?:string;
}){
 const [open,setOpen]=useState(false);
 const close=useCallback(()=>setOpen(false),[]);
 return <>
  <button type="button" className={triggerClassName??"location-drawer-link"} onClick={()=>setOpen(true)}>{trigger}</button>
  <ManagementDrawer open={open} title={title} subtitle={location?.id?"Update the service location details for this customer.":"Add a location where you provide service for this customer."} size="wide" onDirty={()=>{}} onClose={close}>
   <ServiceLocationForm
    action={action}
    location={location}
    googleMapsApiKey={googleMapsApiKey}
    onCancel={close}
   />
  </ManagementDrawer>
 </>;
}
