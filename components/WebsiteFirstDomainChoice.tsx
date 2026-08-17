"use client";

import {useEffect,useState} from "react";

type DomainChoice="need_domain"|"existing_domain";
type DomainQuote={domain:string;available:boolean;premium:boolean;purchasePrice:number;renewalPrice:number;currency:string;years:number};
type CheckState={kind:"idle"|"checking"|"success"|"error";quote?:DomainQuote;message?:string};

const money=(value:number,currency:string)=>new Intl.NumberFormat("en-US",{style:"currency",currency,maximumFractionDigits:2}).format(value);

export function WebsiteFirstDomainChoice({slug,initialChoice="need_domain",initialDomain=""}:{slug:string;initialChoice?:string;initialDomain?:string}){
 const [choice,setChoice]=useState<DomainChoice>(initialChoice==="existing_domain"?"existing_domain":"need_domain"),[domain,setDomain]=useState(initialDomain),[check,setCheck]=useState<CheckState>({kind:"idle"});
 const choose=(next:DomainChoice)=>{setChoice(next);setCheck({kind:"idle"});};
 const updateDomain=(value:string)=>{setDomain(value);setCheck({kind:"idle"});};
 async function checkAvailability(){
  if(!domain.trim()){setCheck({kind:"error",message:"Enter the domain you want first."});return;}
  setCheck({kind:"checking"});
  try{
   const response=await fetch("/api/domains/availability",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({domain})}),body=await response.json();
   if(!response.ok)throw new Error(typeof body?.error==="string"?body.error:"We couldn't check that domain right now.");
   setDomain(body.domain);setCheck({kind:"success",quote:body});
  }catch(error){setCheck({kind:"error",message:error instanceof Error?error.message:"We couldn't check that domain right now."});}
 }
 useEffect(()=>{
  if(choice!=="need_domain"||!domain.trim()||domain.trim().length<4)return;
  const timer=window.setTimeout(()=>{void checkAvailability();},700);
  return ()=>window.clearTimeout(timer);
 // The check deliberately follows the value after a short pause; it never reserves or purchases anything.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[choice,domain]);
 const quote=check.quote;
 return <fieldset className="wide website-first-domain"><legend>Your website address</legend><p>Your first year of a standard .com domain is included with your Servonas pilot.</p><div className="website-first-domain-options"><label className={choice==="need_domain"?"selected":""}><input type="radio" name="domainPreference" value="need_domain" checked={choice==="need_domain"} onChange={()=>choose("need_domain")}/><i aria-hidden="true">{choice==="need_domain"?"✓":""}</i><span><strong>Get me a new domain <b>Included</b></strong><small>Tell us the website address you&apos;d like and we&apos;ll help get it connected.</small></span></label><label className={choice==="existing_domain"?"selected":""}><input type="radio" name="domainPreference" value="existing_domain" checked={choice==="existing_domain"} onChange={()=>choose("existing_domain")}/><i aria-hidden="true">{choice==="existing_domain"?"✓":""}</i><span><strong>I already own a domain</strong><small>We&apos;ll help connect your existing domain to your new Servonas website.</small></span></label></div><label className="website-first-domain-name">{choice==="need_domain"?"What website address would you like?":"Your domain"}<span className="website-first-domain-input"><input required name="domainName" value={domain} onChange={event=>updateDomain(event.target.value)} placeholder="yourbusiness.com" autoCapitalize="none" autoCorrect="off"/>{choice==="need_domain"&&<button type="button" onClick={checkAvailability} disabled={check.kind==="checking"}>{check.kind==="checking"?"Checking…":"Check now"}</button>}</span><small>{choice==="need_domain"?"We check automatically while you type. This does not reserve or purchase the domain.":"We&apos;ll walk you through connecting it after your website is ready."}</small></label>{choice==="need_domain"&&check.kind==="error"&&<div className="website-domain-result error" role="alert"><strong>We couldn&apos;t confirm availability</strong><span>{check.message}</span></div>}{choice==="need_domain"&&quote&&<div className={`website-domain-result ${quote.available&&!quote.premium?"available":"unavailable"}`} role="status"><strong>{quote.available?quote.premium?`${quote.domain} is a premium domain`:`✓ ${quote.domain} is available`:`That domain is already taken.`}</strong>{quote.available&&!quote.premium&&<><span><b>First year: Free</b> with Servonas</span><span>After your first year: approximately <b>{money(quote.renewalPrice,quote.currency)} per year</b>.</span></>}{quote.available&&quote.premium&&<span>This domain costs {money(quote.purchasePrice,quote.currency)} for the first year and is not included in the free standard-domain offer. Try another domain.</span>}{!quote.available&&<span>Try another name or extension.</span>}</div>}{choice==="need_domain"&&slug&&<details className="website-first-temporary-url"><summary>Prefer a free Servonas address?</summary><strong>servonas.com/sites/{slug}</strong><small>You can use this temporary address while we handle your domain request.</small></details>}</fieldset>;
}
