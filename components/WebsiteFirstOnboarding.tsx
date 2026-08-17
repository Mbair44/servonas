"use client";
import {useActionState,useState} from "react";
import {createWebsiteFirstWorkspace,type WebsiteFirstState} from "@/app/onboarding/actions";
import {getWebsiteFirstConfig,type WebsiteFirstSource} from "@/lib/websiteFirstConfig";
import {WebsiteFirstDomainChoice} from "./WebsiteFirstDomainChoice";
import {WebsiteFirstServiceGrid} from "./WebsiteFirstServiceGrid";
import {AcquisitionFunnelTracker,acquisitionSessionId,trackAcquisition} from "./AcquisitionFunnelTracker";

const usStates=[["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["DC","District of Columbia"],["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"]] as const;

export function WebsiteFirstBusiness({defaultEmail="",source}:{defaultEmail?:string;source:WebsiteFirstSource}){
 const config=getWebsiteFirstConfig(source)!;
 const [state,action,pending]=useActionState(createWebsiteFirstWorkspace,{} as WebsiteFirstState);
 const [name,setName]=useState(state.values?.name??"");
 const [slug,setSlug]=useState(state.values?.slug??"");
 const clean=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
 const isPestControl=source==="pest-control-website";
 const serviceOptions=config.services.map((service)=>({value:service,label:service,other:service.startsWith("Other")}));
 return <div className="website-first-shell">
  <header><span>1. Business</span><i/><span>2. Style</span><i/><span>3. Preview</span></header>
  <section><AcquisitionFunnelTracker industry={source} event="website_builder_step1_started"/><span className="sv-kicker">Your {config.industryLabel} website</span><h1>{config.businessHeading}</h1><p>Give us the basics and we&apos;ll build your first website preview. You can fine-tune everything later.</p>{state.error&&<p className="auth-error">{state.error}</p>}
   <form action={async(formData)=>{formData.set("acquisitionSessionId",acquisitionSessionId());trackAcquisition(source,"website_preview_generation_started");await action(formData);}} className="website-first-form website-first-business-form"><input type="hidden" name="source" value={source}/><input type="hidden" name="slug" value={slug||clean(name)||"new-business"}/><p className="wide website-required-note"><span>*</span> Required fields</p>
    <fieldset className="wide website-first-basics"><legend>Business basics</legend><div className="website-first-basics-grid">
     <label><span className="website-field-title">Business name <span className="website-required" aria-hidden="true">*</span></span><input required name="name" value={name} onChange={event=>{setName(event.target.value);setSlug(clean(event.target.value));}} maxLength={120}/></label>
     <label><span className="website-field-title">Business phone <span className="website-required" aria-hidden="true">*</span></span><input required name="phone" type="tel" autoComplete="tel" defaultValue={state.values?.phone}/></label>
     <label><span className="website-field-title">Business email <span className="website-required" aria-hidden="true">*</span></span><input required name="email" type="email" autoComplete="email" defaultValue={state.values?.email??defaultEmail}/></label>
     <label><span className="website-field-title">City <span className="website-required" aria-hidden="true">*</span></span><input required name="city" autoComplete="address-level2" defaultValue={state.values?.city}/></label>
     <label><span className="website-field-title">State <span className="website-required" aria-hidden="true">*</span></span><select required name="state" autoComplete="address-level1" defaultValue={state.values?.state??""}><option value="" disabled>Select a state</option>{usStates.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
    </div></fieldset>
    {source==="car-detailing-website"&&<label className="wide">Business setup<select name="serviceModel" defaultValue="mobile"><option value="mobile">Mobile detailing</option><option value="shop">Physical detailing shop</option><option value="both">Mobile and shop</option></select></label>}
    <WebsiteFirstDomainChoice slug={slug} initialChoice={state.values?.domainPreference} initialDomain={state.values?.domainName}/>
    <fieldset className="wide website-first-area"><legend>Where do you work?</legend><label>Primary service area <small>Optional</small><input name="serviceArea" placeholder="East Valley and surrounding areas" defaultValue={state.values?.serviceArea}/><em>We&apos;ll use this to tailor your website copy.</em></label></fieldset>
    <WebsiteFirstServiceGrid heading="What services do you offer?" description="Select all that apply. You can customize these later." options={serviceOptions} initialSelected={state.selectedServices} customOther={isPestControl}/>
    <button className="sv-button wide website-first-preview-cta" disabled={pending}>{pending?"Building your website preview…":"Build My Website Preview"}</button><p className="wide website-first-next">Next: Pick a style and see your website.</p>
   </form>
  </section>
 </div>;
}
