"use client";

import {useMemo,useRef,useState} from "react";

const tokens=[
 {value:"{first_name}",label:"First name",example:"Hi Maria"},
 {value:"{last_name}",label:"Last name",example:"Garcia"},
 {value:"{customer_name}",label:"Customer name",example:"Maria Garcia or company name"},
 {value:"{business_name}",label:"Business name",example:"Your business name"},
];

export function CampaignComposerFields({businessName,customer}:{businessName:string;customer:{firstName:string;lastName:string;companyName:string}}){
 const [channel,setChannel]=useState("email"),[body,setBody]=useState(""),textarea=useRef<HTMLTextAreaElement>(null);
 const cursorFragment=()=>{const field=textarea.current;if(!field)return"";return field.value.slice(0,field.selectionStart).match(/\{[a-z_]*$/i)?.[0]??"";};
 const [fragment,setFragment]=useState("");
 const insert=(token:string)=>{const field=textarea.current;if(!field)return;const start=field.selectionStart,end=field.selectionEnd,current=field.value,partial=current.slice(0,start).match(/\{[a-z_]*$/i)?.[0]??"",from=start-partial.length,next=`${current.slice(0,from)}${token}${current.slice(end)}`,cursor=from+token.length;setBody(next);setFragment("");requestAnimationFrame(()=>{field.focus();field.setSelectionRange(cursor,cursor);});};
 const suggestions=fragment?tokens.filter(token=>token.value.toLowerCase().startsWith(fragment.toLowerCase())):[];
 const preview=useMemo(()=>body.replaceAll("{first_name}",customer.firstName||customer.companyName||"there").replaceAll("{last_name}",customer.lastName).replaceAll("{customer_name}",customer.companyName||`${customer.firstName} ${customer.lastName}`.trim()||"Customer").replaceAll("{business_name}",businessName),[body,businessName,customer]);
 return <>
  <label>Campaign name<input name="name" required maxLength={160} placeholder="Fall service reminder"/></label>
  <label>Channel<select name="channel" value={channel} onChange={event=>setChannel(event.target.value)}><option value="email">Email</option><option value="sms">Text message</option></select><small>{channel==="sms"?"Texts only send to customers with explicit SMS consent.":"Campaign email opt-outs are automatically suppressed."}</small></label>
  <label>Email subject<input name="subject" required={channel==="email"} disabled={channel!=="email"} maxLength={200} placeholder="Time to schedule your fall service"/><small>{channel==="email"?"Customers see this in their inbox.":"A subject is not used for text messages."}</small></label>
  <div className="campaign-personalization-help"><strong>Personalize the message</strong><p>Select a field to insert it where your cursor is. Servonas replaces it separately for every customer.</p><div>{tokens.map(token=><button type="button" onClick={()=>insert(token.value)} title={`Example: ${token.example}`} key={token.value}><span>{token.label}</span><code>{token.value}</code></button>)}</div></div>
  <label className="wide campaign-message-field">Message<textarea ref={textarea} name="body" required maxLength={5000} rows={10} value={body} onChange={event=>{setBody(event.target.value);requestAnimationFrame(()=>setFragment(cursorFragment()));}} onClick={()=>setFragment(cursorFragment())} onKeyUp={()=>setFragment(cursorFragment())} placeholder={`Hi {first_name},\n\nIt’s time to schedule your next service with {business_name}.`}/>{suggestions.length>0&&<div className="campaign-token-suggestions" role="listbox" aria-label="Personalization suggestions">{suggestions.map(token=><button type="button" role="option" onClick={()=>insert(token.value)} key={token.value}><strong>{token.label}</strong><code>{token.value}</code><small>{token.example}</small></button>)}</div>}<small>Tip: type <code>{"{"}</code> to see personalization choices. URLs are automatically click-tracked.</small></label>
  {body&&<aside className="campaign-live-preview"><span>Example for {customer.companyName||`${customer.firstName} ${customer.lastName}`.trim()||"a customer"}</span><pre>{preview}</pre></aside>}
 </>;
}
