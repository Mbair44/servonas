"use client";

import {useActionState,useRef} from "react";
import { trackBookingFunnel } from "@/components/TenantBookingFunnelTracker";

export type WebsiteRequestState={success?:string;error?:string;fieldErrors?:Record<string,string>;values?:Record<string,string>};
type Service={id:string;name:string};

export function WebsiteRequestForm({action,services,businessName,businessSlug,variant="service"}:{action:(state:WebsiteRequestState,data:FormData)=>Promise<WebsiteRequestState>;services:Service[];businessName:string;businessSlug?:string;variant?:"service"|"quote"}){
 const requestKey=useRef(crypto.randomUUID());
 const [state,formAction,pending]=useActionState(action,{});
 const value=(key:string)=>state.values?.[key]??"";
 const quoteMode=variant==="quote";
 const submitLabel=quoteMode?"Get My Free Quote":"Request Service";
 const headingLabel=quoteMode?`What do you need ${businessName} to remove?`:`How can ${businessName} help?`;
 if(state.success)return <div className="business-site-request-success" role="status"><strong>Request received</strong><p>{state.success}</p></div>;
 return <form action={async(formData)=>{if(businessSlug)trackBookingFunnel(businessSlug,"customer_info_entered",{metadata:{mode:quoteMode?"quote_request":"service_request",surface:"public_request_form"}});await formAction(formData);}} className="business-site-request-form" onFocus={()=>{if(businessSlug)trackBookingFunnel(businessSlug,"booking_started",{metadata:{mode:quoteMode?"quote_request":"service_request",surface:"public_request_form"}});}}>
  <input type="hidden" name="requestKey" value={requestKey.current}/><label className="site-honeypot" aria-hidden="true">Company website<input name="companyWebsite" tabIndex={-1} autoComplete="off"/></label>
  {state.error&&<div className="business-site-form-error" role="alert">{state.error}</div>}
  <label>Name<input required name="name" maxLength={200} autoComplete="name" defaultValue={value("name")}/>{state.fieldErrors?.name&&<small>{state.fieldErrors.name}</small>}</label>
  <label>Phone<input required name="phone" type="tel" maxLength={50} autoComplete="tel" defaultValue={value("phone")}/>{state.fieldErrors?.phone&&<small>{state.fieldErrors.phone}</small>}</label>
  <label>Email <small>Optional</small><input name="email" type="email" maxLength={320} autoComplete="email" defaultValue={value("email")}/>{state.fieldErrors?.email&&<small>{state.fieldErrors.email}</small>}</label>
  <label>{quoteMode?"What needs to go?":"Service needed"}<select required name="serviceId" defaultValue={value("serviceId")}><option value="">{quoteMode?"Choose what you need removed":"Choose a service"}</option>{services.map(service=><option value={service.id} key={service.id}>{service.name}</option>)}<option value="other">Other / not sure</option></select>{state.fieldErrors?.serviceId&&<small>{state.fieldErrors?.serviceId}</small>}</label>
  <label className="wide">{quoteMode?"Pickup address":"Service address"}<input required name="address" maxLength={500} autoComplete="street-address" defaultValue={value("address")}/>{state.fieldErrors?.address&&<small>{state.fieldErrors.address}</small>}</label>
  <label className="wide">{headingLabel}<textarea required name="description" rows={5} maxLength={4000} defaultValue={value("description")} placeholder={quoteMode?"For example: couch, mattress, garage junk, yard debris, or a full cleanout.":"Tell us how we can help."}/>{state.fieldErrors?.description&&<small>{state.fieldErrors.description}</small>}</label>
  <label className="wide">Preferred date or time <small>Optional</small><input name="preferredAt" maxLength={200} placeholder="For example: Tuesday afternoon" defaultValue={value("preferredAt")}/></label>
  {quoteMode&&<p className="business-site-request-note">Photo uploads are not yet enabled on the public quote form. Customers can still describe the job and your team can follow up for photos.</p>}
  <button disabled={pending}>{pending?"Sending request…":submitLabel}</button>
 </form>;
}
