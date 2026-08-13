"use client";
import {useActionState,useState} from "react";
import {createWebsiteFirstWorkspace,type WebsiteFirstState} from "@/app/onboarding/actions";
import {getWebsiteFirstConfig,type WebsiteFirstSource} from "@/lib/websiteFirstConfig";
import {WebsiteFirstDomainChoice} from "./WebsiteFirstDomainChoice";
import {WebsiteFirstServiceGrid} from "./WebsiteFirstServiceGrid";

export function WebsiteFirstBusiness({defaultEmail="",source}:{defaultEmail?:string;source:WebsiteFirstSource}){
 const config=getWebsiteFirstConfig(source)!;
 const [state,action,pending]=useActionState(createWebsiteFirstWorkspace,{} as WebsiteFirstState);
 const [name,setName]=useState(state.values?.name??"");
 const [slug,setSlug]=useState(state.values?.slug??"");
 const clean=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
 const serviceOptions=config.services.map((service,index)=>({value:service,label:service,defaultSelected:index<3,other:index===config.services.length-1}));
 return <div className="website-first-shell">
  <header><span>1. Business</span><i/><span>2. Style</span><i/><span>3. Preview</span></header>
  <section><span className="sv-kicker">Your {config.industryLabel} website</span><h1>{config.businessHeading}</h1><p>{config.businessDescription}</p>{state.error&&<p className="auth-error">{state.error}</p>}
   <form action={action} className="website-first-form"><input type="hidden" name="source" value={source}/>
    <label>Business name<input required name="name" value={name} onChange={event=>{setName(event.target.value);setSlug(clean(event.target.value));}} maxLength={120}/></label>
    <label>Website address<div className="sv-input-prefix"><span>servonas.com/sites/</span><input required name="slug" value={slug} onChange={event=>setSlug(clean(event.target.value))}/></div></label>
    <label>Business phone<input required name="phone" type="tel" defaultValue={state.values?.phone}/></label>
    <label>Business email<input required name="email" type="email" defaultValue={state.values?.email??defaultEmail}/></label>
    <label>City<input required name="city" defaultValue={state.values?.city}/></label>
    <label>State<input required name="state" maxLength={40} defaultValue={state.values?.state}/></label>
    {source==="car-detailing-website"&&<label className="wide">Business setup<select name="serviceModel" defaultValue="mobile"><option value="mobile">Mobile detailing</option><option value="shop">Physical detailing shop</option><option value="both">Mobile and shop</option></select></label>}
    <WebsiteFirstDomainChoice slug={slug} initialChoice={state.values?.domainPreference} initialDomain={state.values?.domainName}/>
    <label className="wide">Primary service area <small>Optional</small><input name="serviceArea" placeholder="East Valley and surrounding areas" defaultValue={state.values?.serviceArea}/></label>
    <label className="wide">Short business description <small>Optional</small><textarea name="description" rows={3} maxLength={500} defaultValue={state.values?.description} placeholder={config.defaultSubheading}/></label>
    <WebsiteFirstServiceGrid heading="What services do you offer?" description="Select all that apply. You can customize these later." options={serviceOptions} initialSelected={state.selectedServices}/>
    <button className="sv-button wide" disabled={pending}>{pending?"Creating your website…":"Choose My Website Style"}</button>
   </form>
  </section>
 </div>;
}
