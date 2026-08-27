"use client";

import {useFormStatus} from "react-dom";

export function DomainAvailabilitySubmit({label="Check Availability →",title="Checking domain availability",message="Servonas is checking whether this domain is available and pricing the renewal. Please keep this page open.",formAction,formNoValidate=true}:{label?:string;title?:string;message?:string;formAction?:((formData:FormData)=>void|Promise<void>)|string;formNoValidate?:boolean;}){
 const {pending}=useFormStatus();
 return <>
  <button className="sv-button" type="submit" formAction={formAction} formNoValidate={formNoValidate} disabled={pending} aria-disabled={pending}>{pending?"Checking availability…":label}</button>
  {pending&&<div className="domain-availability-overlay" role="status" aria-live="assertive" aria-busy="true"><section><span className="domain-availability-spinner" aria-hidden="true"/><h2>{title}</h2><p>{message}</p></section></div>}
 </>;
}
