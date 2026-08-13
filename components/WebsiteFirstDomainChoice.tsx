"use client";

import {useState} from "react";

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
 const quote=check.quote;
 return <fieldset className="wide website-first-domain"><legend>Choose your website address</legend><p>We&apos;ll cover one standard domain for your first year as part of the Servonas pilot.</p><div className="website-first-domain-options"><label className={choice==="need_domain"?"selected":""}><input type="radio" name="domainPreference" value="need_domain" checked={choice==="need_domain"} onChange={()=>choose("need_domain")}/><i aria-hidden="true">{choice==="need_domain"?"✓":""}</i><span><strong>I want Servonas to get my domain <b>Included</b></strong><small>Your first year is free for one available standard domain. You&apos;ll see the annual renewal price before continuing.</small></span></label><label className={choice==="existing_domain"?"selected":""}><input type="radio" name="domainPreference" value="existing_domain" checked={choice==="existing_domain"} onChange={()=>choose("existing_domain")}/><i aria-hidden="true">{choice==="existing_domain"?"✓":""}</i><span><strong>I already own a domain</strong><small>We&apos;ll help you connect your existing domain to your Servonas website.</small></span></label></div><label className="website-first-domain-name">{choice==="need_domain"?"What domain would you like?":"Your domain"}<span className="website-first-domain-input"><input required name="domainName" value={domain} onChange={event=>updateDomain(event.target.value)} placeholder={choice==="need_domain"?"desertshieldpest.com":"examplepestcontrol.com"} autoCapitalize="none" autoCorrect="off"/>{choice==="need_domain"&&<button type="button" onClick={checkAvailability} disabled={check.kind==="checking"}>{check.kind==="checking"?"Checking…":"Check availability"}</button>}</span><small>{choice==="need_domain"?"Checking availability does not reserve or purchase the domain.":"We'll walk you through connecting it after your website is ready."}</small></label>{choice==="need_domain"&&check.kind==="error"&&<div className="website-domain-result error" role="alert"><strong>We couldn&apos;t confirm availability</strong><span>{check.message}</span></div>}{choice==="need_domain"&&quote&&<div className={`website-domain-result ${quote.available&&!quote.premium?"available":"unavailable"}`} role="status"><strong>{quote.available?quote.premium?`${quote.domain} is a premium domain`:`${quote.domain} is available`:`${quote.domain} is not available`}</strong>{quote.available&&!quote.premium&&<><span><b>First year: Free</b> with Servonas</span><span>After your first year: approximately <b>{money(quote.renewalPrice,quote.currency)} per year</b>.</span></>}{quote.available&&quote.premium&&<span>This domain costs {money(quote.purchasePrice,quote.currency)} for the first year and is not included in the free standard-domain offer. Try another domain.</span>}{!quote.available&&<span>Try another name or extension and check again.</span>}</div>}{choice==="need_domain"&&slug&&<div className="website-first-temporary-url"><span>Your website can go live while we handle your request</span><strong>servonas.com/sites/{slug}</strong><small>One standard first-year registration is included. Premium domains are not included; renewal after the first year is your responsibility.</small></div>}</fieldset>;
}
