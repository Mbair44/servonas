"use client";

import {useActionState, useEffect, useMemo, useState} from "react";
import type {BusinessSiteData} from "./BusinessWebsite";

type LeadCaptureState={success?:boolean;error?:string;couponCode?:string;successMessage?:string};

const eligibleKey=(fingerprint:string)=>`servonas:lead-capture:${fingerprint}`;
const dismissedValue=(until:number)=>JSON.stringify({state:"dismissed",until});
const completedValue=(fingerprint:string)=>JSON.stringify({state:"completed",fingerprint});

function offerLabel(site:BusinessSiteData){
 const popup=site.leadCapturePopup;
 if(popup.discountType==="percentage"&&popup.discountValue!=null)return `${popup.discountValue/100}% off`;
 if(popup.discountType==="fixed"&&popup.discountValue!=null)return `$${(popup.discountValue/100).toFixed(0)} off`;
 return popup.customOffer||"Special offer";
}

export function WebsiteLeadCapturePopup({site,action}:{site:BusinessSiteData;action:(state:LeadCaptureState,data:FormData)=>Promise<LeadCaptureState>}){
 const [state,formAction,pending]=useActionState(action,{});
 const [open,setOpen]=useState(false);
 const popup=site.leadCapturePopup;
 const storageKey=popup.fingerprint;
 const offer=useMemo(()=>offerLabel(site),[site]);

 useEffect(()=>{
  if(!popup.enabled)return;
  const saved=window.localStorage.getItem(eligibleKey(storageKey));
  if(saved){
   try{
    const parsed=JSON.parse(saved) as {state?:string;until?:number;fingerprint?:string};
    if(parsed.state==="completed"&&parsed.fingerprint===storageKey)return;
    if(parsed.state==="dismissed"&&Number(parsed.until??0)>Date.now())return;
   }catch{}
  }
  const timer=window.setTimeout(()=>setOpen(true),popup.delaySeconds*1000);
  return ()=>window.clearTimeout(timer);
 },[popup.delaySeconds,popup.enabled,storageKey]);

 useEffect(()=>{
  if(state.success){
    window.localStorage.setItem(eligibleKey(storageKey),completedValue(storageKey));
    setOpen(true);
  }
 },[state.success,storageKey]);

 if(!popup.enabled||!open)return null;

 return <div className="website-lead-popup-backdrop" role="presentation">
  <section className="website-lead-popup" role="dialog" aria-modal="true" aria-labelledby="website-lead-popup-title">
   <button type="button" className="website-lead-popup-close" aria-label="Close offer" onClick={()=>{window.localStorage.setItem(eligibleKey(storageKey),dismissedValue(Date.now()+7*24*60*60*1000));setOpen(false);}}>×</button>
   {!state.success?<form action={async(formData)=>{formData.set("pageUrl",window.location.href);formData.set("landingPath",`${window.location.pathname}${window.location.search}`);formData.set("referrer",document.referrer||"");const params=new URLSearchParams(window.location.search);for(const key of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid"])formData.set(key,params.get(key)||"");await formAction(formData);}} className="website-lead-popup-form">
    <span>Special offer</span>
    <h2 id="website-lead-popup-title">{popup.headline}</h2>
    <p>{popup.body}</p>
    <div className="website-lead-popup-offer"><strong>{offer}</strong>{popup.couponCode&&<code>{popup.couponCode}</code>}</div>
    {state.error&&<div className="business-site-form-error" role="alert">{state.error}</div>}
    <label>Email address
     <input required name="email" type="email" autoComplete="email" maxLength={320} placeholder="you@example.com"/>
    </label>
    <label className="website-lead-popup-consent">
     <input required name="marketingConsent" type="checkbox" value="on"/>
     <span>{popup.disclosure}</span>
    </label>
    <label className="site-honeypot" aria-hidden="true">Company website<input name="companyWebsite" tabIndex={-1} autoComplete="off"/></label>
    <button className="site-primary-button" disabled={pending}>{pending? "Sending your offer…":popup.ctaText}</button>
   </form>:<div className="website-lead-popup-success" role="status">
    <span>You&apos;re in!</span>
    <h2>{state.successMessage||popup.successMessage}</h2>
    <p>{state.couponCode?`Use code ${state.couponCode} at checkout.`:"We saved your email and your offer is ready."}</p>
    {state.couponCode&&<div className="website-lead-popup-actions"><button type="button" className="site-secondary-button" onClick={()=>navigator.clipboard.writeText(state.couponCode!)}>Copy code</button>{site.bookingUrl&&<a className="site-primary-button" href={site.bookingUrl}>Book now</a>}</div>}
   </div>}
  </section>
 </div>;
}
