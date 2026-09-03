"use client";

import {useActionState,useRef} from "react";
import { trackBookingFunnel } from "@/components/TenantBookingFunnelTracker";

export type WebsiteRequestState={success?:string;error?:string;fieldErrors?:Record<string,string>;values?:Record<string,string>};
type Service={id:string;name:string};

const christmasAreaOptions=["Roofline","Front of house","Trees","Bushes","Walkways","Garage","Wreaths/garland","Full property","Commercial property","Not sure — help me design it"];
const christmasPreferenceOptions=["Warm white","Cool white","Multicolor","Red & white","Custom","Not sure"];
const christmasTimingOptions=["As soon as possible","Before Thanksgiving","Thanksgiving week","Early December","Specific date"];

export function WebsiteRequestForm({action,services,businessName,businessSlug,variant="service"}:{action:(state:WebsiteRequestState,data:FormData)=>Promise<WebsiteRequestState>;services:Service[];businessName:string;businessSlug?:string;variant?:"service"|"quote"|"christmas"}){
 const requestKey=useRef(crypto.randomUUID());
 const [state,formAction,pending]=useActionState(action,{});
 const value=(key:string)=>state.values?.[key]??"";
 const quoteMode=variant==="quote";
 const christmasMode=variant==="christmas";
 const submitLabel=christmasMode||quoteMode?"Get My Free Quote":"Request Service";
 const headingLabel=quoteMode?`What do you need ${businessName} to remove?`:christmasMode?`Tell ${businessName} about your lighting project`:`How can ${businessName} help?`;
 if(state.success)return <div className="business-site-request-success" role="status"><strong>Request received</strong><p>{state.success}</p></div>;
 return <form action={async(formData)=>{const selectedServiceId=String(formData.get("serviceId")??"").trim()||undefined;if(businessSlug)trackBookingFunnel(businessSlug,"lead_submitted",{serviceId:selectedServiceId,metadata:{service_id:selectedServiceId??null,mode:quoteMode?"quote_request":"service_request",surface:"public_request_form"}});await formAction(formData);}} className="business-site-request-form" onFocus={()=>{if(businessSlug)trackBookingFunnel(businessSlug,"booking_cta_click",{metadata:{mode:quoteMode?"quote_request":"service_request",surface:"public_request_form"}});}}>
  <input type="hidden" name="requestKey" value={requestKey.current}/><input type="hidden" name="requestVariant" value={christmasMode?"christmas_quote":quoteMode?"quote":"service"}/><label className="site-honeypot" aria-hidden="true">Company website<input name="companyWebsite" tabIndex={-1} autoComplete="off"/></label>
  {state.error&&<div className="business-site-form-error" role="alert">{state.error}</div>}
  {christmasMode&&<label className="wide">Project type<select required name="serviceId" defaultValue={value("serviceId")} onChange={event=>{if(businessSlug&&event.target.value)trackBookingFunnel(businessSlug,"service_view",{serviceId:event.target.value,metadata:{service_id:event.target.value,surface:"public_request_form"}});}}><option value="">Choose a project type</option>{services.map(service=><option value={service.id} key={service.id}>{service.name}</option>)}<option value="other">Other / not sure</option></select>{state.fieldErrors?.serviceId&&<small>{state.fieldErrors?.serviceId}</small>}</label>}
  {christmasMode&&<label className="wide">Service address<input required name="address" maxLength={500} autoComplete="street-address" defaultValue={value("address")}/>{state.fieldErrors?.address&&<small>{state.fieldErrors.address}</small>}</label>}
  {christmasMode&&<fieldset className="wide business-site-request-fieldset"><legend>What would you like decorated?</legend><div className="business-site-choice-grid">{christmasAreaOptions.map(option=><label key={option} className="business-site-choice"><input type="checkbox" name="decoratedAreas" value={option} defaultChecked={value("decoratedAreas").split("\n").includes(option)}/><span>{option}</span></label>)}</div>{state.fieldErrors?.decoratedAreas&&<small>{state.fieldErrors.decoratedAreas}</small>}</fieldset>}
  {christmasMode&&<label>Approximate square footage <small>Optional</small><input name="squareFootage" maxLength={80} defaultValue={value("squareFootage")} placeholder="For example: 2,400"/></label>}
  {christmasMode&&<label>Number of stories <small>Optional</small><input name="stories" maxLength={40} defaultValue={value("stories")} placeholder="For example: 2"/></label>}
  {christmasMode&&<label>Roofline length <small>Optional</small><input name="rooflineLength" maxLength={80} defaultValue={value("rooflineLength")} placeholder="If known"/></label>}
  {christmasMode&&<label>Number of trees <small>Optional</small><input name="treeCount" maxLength={40} defaultValue={value("treeCount")} placeholder="If known"/></label>}
  {christmasMode&&<label>Tree heights <small>Optional</small><input name="treeHeights" maxLength={120} defaultValue={value("treeHeights")} placeholder="If known"/></label>}
  {christmasMode&&<label>Lighting preference<select required name="lightingPreference" defaultValue={value("lightingPreference")}><option value="">Choose a lighting style</option>{christmasPreferenceOptions.map(option=><option key={option} value={option}>{option}</option>)}</select>{state.fieldErrors?.lightingPreference&&<small>{state.fieldErrors.lightingPreference}</small>}</label>}
  {christmasMode&&<label>Preferred installation timing<select required name="installationTiming" defaultValue={value("installationTiming")}><option value="">Choose preferred timing</option>{christmasTimingOptions.map(option=><option key={option} value={option}>{option}</option>)}</select>{state.fieldErrors?.installationTiming&&<small>{state.fieldErrors.installationTiming}</small>}</label>}
  {christmasMode&&value("installationTiming")==="Specific date"&&<label className="wide">Requested installation date <small>Optional</small><input name="specificDate" maxLength={80} defaultValue={value("specificDate")} placeholder="For example: November 29"/></label>}
  {christmasMode&&<label className="wide">{headingLabel}<textarea name="projectNotes" rows={4} maxLength={1500} defaultValue={value("projectNotes")} placeholder="Tell us about the look you want, what matters most, or anything you want our designer to know."/></label>}
  <label>Name<input required name="name" maxLength={200} autoComplete="name" defaultValue={value("name")}/>{state.fieldErrors?.name&&<small>{state.fieldErrors.name}</small>}</label>
  <label>Phone<input required name="phone" type="tel" maxLength={50} autoComplete="tel" defaultValue={value("phone")}/>{state.fieldErrors?.phone&&<small>{state.fieldErrors.phone}</small>}</label>
  <label>Email <small>Optional</small><input name="email" type="email" maxLength={320} autoComplete="email" defaultValue={value("email")}/>{state.fieldErrors?.email&&<small>{state.fieldErrors.email}</small>}</label>
  {!christmasMode&&<label>{quoteMode?"What needs to go?":"Service needed"}<select required name="serviceId" defaultValue={value("serviceId")} onChange={event=>{if(businessSlug&&event.target.value)trackBookingFunnel(businessSlug,"service_view",{serviceId:event.target.value,metadata:{service_id:event.target.value,surface:"public_request_form"}});}}><option value="">{quoteMode?"Choose what you need removed":"Choose a service"}</option>{services.map(service=><option value={service.id} key={service.id}>{service.name}</option>)}<option value="other">Other / not sure</option></select>{state.fieldErrors?.serviceId&&<small>{state.fieldErrors?.serviceId}</small>}</label>}
  {!christmasMode&&<label className="wide">{quoteMode?"Pickup address":"Service address"}<input required name="address" maxLength={500} autoComplete="street-address" defaultValue={value("address")}/>{state.fieldErrors?.address&&<small>{state.fieldErrors.address}</small>}</label>}
  {!christmasMode&&<label className="wide">{headingLabel}<textarea required name="description" rows={5} maxLength={4000} defaultValue={value("description")} placeholder={quoteMode?"For example: couch, mattress, garage junk, yard debris, or a full cleanout.":"Tell us how we can help."}/>{state.fieldErrors?.description&&<small>{state.fieldErrors.description}</small>}</label>}
  {!christmasMode&&<label className="wide">Preferred date or time <small>Optional</small><input name="preferredAt" maxLength={200} placeholder="For example: Tuesday afternoon" defaultValue={value("preferredAt")}/></label>}
  {quoteMode&&<p className="business-site-request-note">Photo uploads are not yet enabled on the public quote form. Customers can still describe the job and your team can follow up for photos.</p>}
  {christmasMode&&<p className="business-site-request-note">Photo uploads are not yet enabled on the public quote form. Customers can still submit the property details above, and your team can follow up to collect photos before preparing the quote.</p>}
  <button disabled={pending}>{pending?"Sending request…":submitLabel}</button>
 </form>;
}
