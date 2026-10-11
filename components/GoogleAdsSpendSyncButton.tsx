"use client";
import {useState} from "react";

export function GoogleAdsSpendSyncButton({businessSlug}:{businessSlug:string}){
 const [state,setState]=useState<"idle"|"syncing"|"failed">("idle");
 async function sync(){
  setState("syncing");
  try{const response=await fetch(`/api/google-ads/sync/${encodeURIComponent(businessSlug)}`,{method:"POST"});if(!response.ok)throw new Error();window.location.reload();}
  catch{setState("failed");}
 }
 return <span><button className="sv-button sv-secondary sv-small" type="button" onClick={sync} disabled={state==="syncing"}>{state==="syncing"?"Syncing Google Ads…":"Refresh Google Ads spend"}</button>{state==="failed"?<small className="form-error">Google Ads spend could not be refreshed. Check the connected account and try again.</small>:null}</span>;
}
