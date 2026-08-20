"use client";

import {useEffect,useRef} from "react";

export function AutoSubmitManagedDomainAvailability(){
 const submitted=useRef(false);

 useEffect(()=>{
  if(submitted.current)return;
  submitted.current=true;
  const form=document.querySelector<HTMLFormElement>('form[data-auto-check-domain="true"]');
  if(!form)return;
  const timer=window.setTimeout(()=>form.requestSubmit(),120);
  return()=>window.clearTimeout(timer);
 },[]);

 return <p className="website-domain-help">Checking availability now…</p>;
}
