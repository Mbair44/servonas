"use client";

import {useState,useTransition} from "react";
import {sendPlatformEmailCampaign} from "./actions";

export function PlatformEmailComposer({eligibleCount}:{eligibleCount:number}){
 const [message,setMessage]=useState(""),[pending,startTransition]=useTransition();
 return <section className="workspace-panel platform-email-composer"><div className="panel-title"><div><h2>Email Servonas customers</h2><p>Send a Servonas platform announcement to each active workspace with a business email address.</p></div><span>{eligibleCount} eligible</span></div><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);startTransition(async()=>{const result=await sendPlatformEmailCampaign(form);setMessage(result.ok?`Sent ${result.sent??0}; skipped ${result.skipped??0}; failed ${result.failed??0}.`:result.error??"The email could not be sent.");if(result.ok)event.currentTarget.reset();});}}><input type="hidden" name="sendToken" value={crypto.randomUUID()}/><label>Subject<input name="subject" required maxLength={160} placeholder="A quick update from Servonas" disabled={pending}/></label><label>Message<textarea name="body" required maxLength={5000} rows={7} placeholder="Write your update to Servonas customers…" disabled={pending}/></label><label className="platform-email-confirm"><input type="checkbox" name="confirm" value="on" required disabled={pending}/><span>I understand this sends immediately to {eligibleCount} customer business email addresses. Each email includes an unsubscribe link.</span></label><div><button className="sv-button" disabled={pending||eligibleCount===0}>{pending?"Sending…":"Send email to all customers"}</button>{message&&<small role="status">{message}</small>}</div></form></section>;
}
