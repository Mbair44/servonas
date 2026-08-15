"use client";

import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {syncManagedDomainRegistration} from "@/app/app/[businessSlug]/settings/website/actions";

export function ManagedDomainStatusPoller({businessSlug,initialStatus}:{businessSlug:string;initialStatus:string}){
 const router=useRouter(),[status,setStatus]=useState(initialStatus),attempts=useRef(0);
 useEffect(()=>{
  if(!["registration_pending","registered"].includes(status))return;
  let cancelled=false,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{if(cancelled||attempts.current>=40)return;attempts.current++;try{const result=await syncManagedDomainRegistration(businessSlug);if(cancelled)return;if(result.status!==status){setStatus(result.status);router.refresh();}if(["registration_pending","registered"].includes(result.status))timer=setTimeout(poll,5000);}catch{if(!cancelled)timer=setTimeout(poll,10000);}};
  timer=setTimeout(poll,1500);return()=>{cancelled=true;clearTimeout(timer);};
 },[businessSlug,router,status]);
 return <div className={`managed-domain-progress ${status}`} role="status" aria-live="polite"><i/><span><strong>{status==="connected"?"Domain connected":status==="registered"?"Registration complete — connecting website":status==="failed"?"Registration needs attention":"Registration in progress"}</strong><small>{status==="connected"?"Your custom address is ready.":status==="failed"?"No automatic retry will occur. Contact Servonas support.":"You can leave this page. Servonas is checking Vercel automatically."}</small></span></div>;
}
