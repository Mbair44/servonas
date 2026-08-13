"use client";
import {useActionState,useState} from "react";
import {createWebsiteFirstWorkspace,type WebsiteFirstState} from "@/app/onboarding/actions";
import {getWebsiteFirstConfig,type WebsiteFirstSource} from "@/lib/websiteFirstConfig";
import {WebsiteFirstDomainChoice} from "./WebsiteFirstDomainChoice";
import {WebsiteFirstServiceGrid} from "./WebsiteFirstServiceGrid";

const usStates=[["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["DC","District of Columbia"],["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"]] as const;

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
   <form action={action} className="website-first-form"><input type="hidden" name="source" value={source}/><p className="wide website-required-note"><span>*</span> Required fields</p>
    <label><span className="website-field-title">Business name <span className="website-required" aria-hidden="true">*</span></span><input required name="name" value={name} onChange={event=>{setName(event.target.value);setSlug(clean(event.target.value));}} maxLength={120}/></label>
    <label><span className="website-field-title">Website address <span className="website-required" aria-hidden="true">*</span></span><div className="sv-input-prefix"><span>servonas.com/sites/</span><input required name="slug" value={slug} onChange={event=>setSlug(clean(event.target.value))}/></div></label>
    <label><span className="website-field-title">Business phone <span className="website-required" aria-hidden="true">*</span></span><input required name="phone" type="tel" autoComplete="tel" defaultValue={state.values?.phone}/></label>
    <label><span className="website-field-title">Business email <span className="website-required" aria-hidden="true">*</span></span><input required name="email" type="email" autoComplete="email" defaultValue={state.values?.email??defaultEmail}/></label>
    <label><span className="website-field-title">City <span className="website-required" aria-hidden="true">*</span></span><input required name="city" autoComplete="address-level2" defaultValue={state.values?.city}/></label>
    <label><span className="website-field-title">State <span className="website-required" aria-hidden="true">*</span></span><select required name="state" autoComplete="address-level1" defaultValue={state.values?.state??""}><option value="" disabled>Select a state</option>{usStates.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
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
