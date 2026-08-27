"use client";
import {useActionState,useState} from "react";
import Link from "next/link";
import {saveBusinessProfile,type BusinessProfileState} from "@/app/onboarding/actions";
import {suggestedProfileDefaults} from "@/lib/onboardingProfile";
const models=[
 ["route_service","Route Service","Repeat visits, dense routes, and recurring work."],
 ["appointment_service","Appointment Service","Scheduled service calls and customer time windows."],
 ["rental_inventory","Rental & Inventory","Delivery, pickup, availability, and physical inventory."],
 ["project_service","Project Service","Longer-running or milestone-based work. Future-ready."],
] as const;
const industries=[["pest_control","Pest Control"],["lawn_care","Lawn Care"],["pool_service","Pool Service"],["hvac","HVAC"],["plumbing","Plumbing"],["electrical","Electrical"],["junk_removal","Junk Removal"],["party_rental","Party Rental"],["equipment_rental","Equipment Rental"],["other","Other"]] as const;
export default function OnboardingBusinessProfile({businessSlug,initialModel="appointment_service",initialIndustry=""}:{businessSlug:string;initialModel?:string;initialIndustry?:string}){
 const [state,action,pending]=useActionState(saveBusinessProfile.bind(null,businessSlug),{} as BusinessProfileState);
 const [model,setModel]=useState(state.values?.operatingModel??initialModel),[industry,setIndustry]=useState(state.values?.industryProfile??initialIndustry);
 const suggestion=suggestedProfileDefaults(industry);
 return <div className="onboarding-frame"><aside><span className="sv-kicker">Guided setup</span><h2>Build around how you operate</h2><ol>{["Welcome","Company","Business profile","Hours","First service","Ready to go"].map((label,index)=><li className={index===2?"active":index<2?"complete":""} key={label}><i>{index<2?"✓":index+1}</i><span>{label}</span></li>)}</ol><p>Industry choices prepare editable suggestions. They never lock or remove Servonas features.</p></aside><section className="onboarding-card"><div className="onboarding-progress" aria-label="Step 3 of 6"><span style={{width:"50%"}}/></div><form action={action} className="onboarding-profile-form"><header><span className="sv-kicker">Step 3 of 6</span><h1>How does your business operate?</h1><p>Choose the closest fit. Servonas supports mixed workflows, and you can change this later.</p></header>{state.error&&<p className="auth-error" role="alert">{state.error}</p>}
  <fieldset><legend>Operating model</legend><div className="onboarding-choice-grid">{models.map(([value,title,description])=><label className={model===value?"selected":""} key={value}><input required type="radio" name="operatingModel" value={value} checked={model===value} onChange={()=>setModel(value)}/><strong>{title}</strong><span>{description}</span></label>)}</div>{state.fieldErrors?.operatingModel&&<small className="field-error">{state.fieldErrors.operatingModel}</small>}</fieldset>
  <fieldset><legend>Industry profile</legend><div className="onboarding-industry-grid">{industries.map(([value,label])=><label className={industry===value?"selected":""} key={value}><input required type="radio" name="industryProfile" value={value} checked={industry===value} onChange={()=>setIndustry(value)}/><span>{label}</span></label>)}</div>{state.fieldErrors?.industryProfile&&<small className="field-error">{state.fieldErrors.industryProfile}</small>}{industry==="other"&&<label>Describe your industry<input required name="otherIndustry" maxLength={100} defaultValue={state.values?.otherIndustry}/>{state.fieldErrors?.otherIndustry&&<small className="field-error">{state.fieldErrors.otherIndustry}</small>}</label>}</fieldset>
  {industry&&<section className="onboarding-suggestion"><span>Editable suggestion for the next step</span><strong>{suggestion.serviceName}</strong><small>{suggestion.durationMinutes} minutes · {suggestion.recurringAllowed?"Recurring available":"One-time by default"}</small></section>}
  <div className="onboarding-actions"><Link className="sv-button sv-secondary" href={`/onboarding?business=${businessSlug}`}>Back</Link><button className="sv-button" disabled={pending}>{pending?"Saving profile…":"Save and continue"}</button></div></form></section></div>;
}
