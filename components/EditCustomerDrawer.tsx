"use client";

import {useCallback,useState} from "react";
import type {CrmActionState} from "@/app/app/[businessSlug]/customers/actions";
import CustomerCrmForm from "./CustomerCrmForm";
import {CustomerActionIcon} from "./CustomerActionIcon";
import {ManagementDrawer} from "./ManagementDrawer";

type Customer={
 first_name?:string|null;last_name?:string|null;company_name?:string|null;
 email?:string|null;phone?:string|null;secondary_phone?:string|null;
 preferred_contact_method?:string|null;notes?:string|null;tags?:string[]|null;
 lead_source?:string|null;is_active?:boolean|null;
};

export function EditCustomerDrawer({customer,action}:{customer:Customer;action:(state:CrmActionState,formData:FormData)=>Promise<CrmActionState>}){
 const [open,setOpen]=useState(false);
 const close=useCallback(()=>setOpen(false),[]);
 return <>
  <button type="button" className="customer-action-item" onClick={()=>setOpen(true)}><i className="customer-action-icon customer"><CustomerActionIcon name="customer"/></i><span><strong>Edit customer</strong><small>Update customer information</small></span><b aria-hidden="true">›</b></button>
  <ManagementDrawer open={open} title="Edit customer" onDirty={()=>{}} onClose={close}>
   <CustomerCrmForm action={action} customer={customer} submitLabel="Save customer"/>
  </ManagementDrawer>
 </>;
}
