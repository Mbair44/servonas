"use client";

import {useState} from "react";

type DomainChoice="need_domain"|"existing_domain";

export function WebsiteFirstDomainChoice({slug,initialChoice="need_domain",initialDomain=""}:{slug:string;initialChoice?:string;initialDomain?:string}){
 const [choice,setChoice]=useState<DomainChoice>(initialChoice==="existing_domain"?"existing_domain":"need_domain");
 return <fieldset className="wide website-first-domain"><legend>Choose your website address</legend><p>You can start with a Servonas website address and connect your own domain anytime.</p><div className="website-first-domain-options"><label className={choice==="need_domain"?"selected":""}><input type="radio" name="domainPreference" value="need_domain" checked={choice==="need_domain"} onChange={()=>setChoice("need_domain")}/><i aria-hidden="true">{choice==="need_domain"?"✓":""}</i><span><strong>I need a website address <b>Recommended</b></strong><small>Start with a free Servonas address. You can add your own domain anytime.</small></span></label><label className={choice==="existing_domain"?"selected":""}><input type="radio" name="domainPreference" value="existing_domain" checked={choice==="existing_domain"} onChange={()=>setChoice("existing_domain")}/><i aria-hidden="true">{choice==="existing_domain"?"✓":""}</i><span><strong>I already own a domain</strong><small>We&apos;ll help you connect it after your website is ready.</small></span></label></div>{choice==="need_domain"&&slug&&<div className="website-first-temporary-url"><span>Your temporary website address</span><strong>servonas.com/sites/{slug}</strong><small>You can connect a custom domain later.</small></div>}{choice==="existing_domain"&&<label className="website-first-domain-name">Your domain<input required name="domainName" defaultValue={initialDomain} placeholder="examplepestcontrol.com" autoCapitalize="none"/><small>We&apos;ll walk you through connecting it after your website is ready.</small></label>}</fieldset>;
}
