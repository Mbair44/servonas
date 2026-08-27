"use client";

import {useFormStatus} from "react-dom";

export function GoogleAdsDraftSubmit({label="Generate campaign draft",pendingLabel="Generating campaign draft…"}:{label?:string;pendingLabel?:string;}){
 const {pending}=useFormStatus();
 return <>
  <button className="sv-button" type="submit" disabled={pending} aria-disabled={pending}>{pending?pendingLabel:label}</button>
  {pending&&<div className="domain-availability-overlay" role="status" aria-live="assertive" aria-busy="true"><section><span className="domain-availability-spinner" aria-hidden="true"/><h2>{pendingLabel}</h2><p>Servonas is building your Google Ads draft. Please keep this page open.</p></section></div>}
 </>;
}
