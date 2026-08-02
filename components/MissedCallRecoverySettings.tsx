"use client";

import {useState} from "react";

type Settings={enabled?:boolean;recovery_number_e164?:string|null;initial_sms_body?:string|null;ai_enabled?:boolean;ai_instructions?:string|null;booking_enabled?:boolean;alert_phone_e164?:string|null}|null;

function PhoneRecoveryIcon(){return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.1 3.5 4.8 4.7c-.8.4-1.2 1.3-.9 2.1 2 6.2 7 11.2 13.2 13.2.8.3 1.7-.1 2.1-.9l1.2-2.3c.4-.8.2-1.7-.5-2.2l-3-2.1c-.6-.4-1.4-.4-2 .1l-1.5 1.2a14.2 14.2 0 0 1-3.2-3.2l1.2-1.5c.5-.6.5-1.4.1-2l-2.1-3c-.5-.7-1.5-1-2.3-.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><rect x="14.5" y="2.5" width="7" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="m16.5 6 1.2-1.2 1.1 1.1 1.2-1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function SaveIcon(){return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 8V3h8l3 3v11H4V8h1Zm3-5v5h5V3M7 17v-5h6v5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>}

export function MissedCallRecoverySettings({settings,defaultPhone,baseUrl,action}:{settings:Settings;defaultPhone:string;baseUrl:string;action:(data:FormData)=>void|Promise<void>}){
 const initialText=settings?.initial_sms_body??"Sorry we missed your call. How can we help? Reply with your name and what service you need. Reply STOP to opt out.";
 const initialAi=settings?.ai_instructions??"Be concise, helpful, and focused on collecting the customer name, service address, issue, urgency, and preferred appointment time. Never diagnose, promise pricing, or minimize an emergency.";
 const [enabled,setEnabled]=useState(settings?.enabled??false),[message,setMessage]=useState(initialText),[instructions,setInstructions]=useState(initialAi);
 return <section className="settings-summary-card missed-call-settings" id="missed-call-recovery">
  <header className="missed-call-settings-header"><i><PhoneRecoveryIcon/></i><div><span>Lead recovery</span><h2>Missed Call Recovery</h2><p>Text missed callers immediately, qualify the request, escalate urgent issues, and book when a confirmed time is available.</p></div><b className={enabled?"active":"inactive"}><em/> {enabled?"Active":"Inactive"}</b></header>
  <form action={action} onReset={()=>{setEnabled(settings?.enabled??false);setMessage(initialText);setInstructions(initialAi)}}>
   <label className="missed-call-master-toggle"><input name="enabled" type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/><span className="switch" aria-hidden="true"/><span><strong>Enable missed-call recovery</strong><small>Automatically text missed callers when we can’t reach your business.</small></span></label>
   <div className="missed-call-phone-grid"><label>Twilio business number<input required name="recoveryNumber" type="tel" defaultValue={settings?.recovery_number_e164??defaultPhone} placeholder="+1 (480) 605-4905"/><small>This is the number we use to text missed callers.</small></label><label>Emergency / on-call alert number <em>(optional)</em><input name="alertPhone" type="tel" defaultValue={settings?.alert_phone_e164??""} placeholder="+1 (480) 555-0123"/><small>We’ll text this number for urgent or emergency situations.</small></label></div>
   <label className="missed-call-textarea">Initial missed-call text<span><textarea required name="initialSms" maxLength={320} value={message} onChange={event=>setMessage(event.target.value)}/><small>{message.length}/320</small></span><em>This is the first text we send after a missed call.</em></label>
   <div className="missed-call-option-grid"><label><input name="aiEnabled" type="checkbox" defaultChecked={settings?.ai_enabled??true}/><span><strong>Use AI to continue the intake conversation</strong><small>AI will ask questions to collect details, qualify the request, and suggest next steps.</small></span></label><label><input name="bookingEnabled" type="checkbox" defaultChecked={settings?.booking_enabled??true}/><span><strong>Allow confirmed appointments</strong><small>When service availability is known, AI can book the appointment.</small></span></label></div>
   <label className="missed-call-textarea">AI behavior<span><textarea required name="aiInstructions" maxLength={500} value={instructions} onChange={event=>setInstructions(event.target.value)}/><small>{instructions.length}/500</small></span><em>These instructions guide how the AI responds.</em></label>
   <div className="missed-call-callback-note"><i>ⓘ</i><p>Set the Twilio voice status callback to <code>{baseUrl}/api/twilio/missed-call</code><br/>This handles no-answer, busy, failed, and canceled calls. Incoming texts continue to use <code>{baseUrl}/api/twilio/inbound</code>.</p></div>
   <footer><button className="sv-button sv-secondary" type="reset">Cancel</button><button className="sv-button" type="submit"><SaveIcon/>Save missed-call recovery</button></footer>
  </form>
 </section>;
}
