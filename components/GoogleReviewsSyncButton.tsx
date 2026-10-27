"use client";
import {useState} from "react";

type Result={recordsSeen:number;recordsInserted:number;recordsUpdated:number};
export function GoogleReviewsSyncButton({businessSlug,disabled}:{businessSlug:string;disabled?:boolean}){
 const [state,setState]=useState<"idle"|"syncing">("idle"),[notice,setNotice]=useState("");
 async function sync(){
  setState("syncing");setNotice("");
  try{const response=await fetch(`/api/google-business/reviews/sync/${encodeURIComponent(businessSlug)}`,{method:"POST"}),payload=await response.json() as Result&{error?:string};if(!response.ok)throw new Error(payload.error||"Google review sync failed.");setNotice(`Synced ${payload.recordsSeen} review${payload.recordsSeen===1?"":"s"}: ${payload.recordsInserted} new, ${payload.recordsUpdated} updated.`);window.setTimeout(()=>window.location.reload(),750);}
  catch(error){setNotice(error instanceof Error?error.message:"Google review sync failed.");}
  finally{setState("idle");}
 }
 return <div className="website-google-actions"><button className="sv-button sv-secondary sv-small" type="button" onClick={sync} disabled={disabled||state==="syncing"}>{state==="syncing"?"Syncing reviews…":"Sync Reviews"}</button>{notice?<small className={notice.startsWith("Synced")?"workspace-notice success":"form-error"}>{notice}</small>:<small>Fetches Google reviews only. It does not send messages or confirm customer matches.</small>}</div>;
}
