"use client";
import {useActionState} from "react";
import Link from "next/link";
import {saveBusinessHours,type BusinessHoursState} from "@/app/onboarding/actions";
import type {DayHours} from "@/lib/onboardingHours";
import {BusinessHoursEditor} from "./BusinessHoursEditor";
export default function OnboardingBusinessHours({businessSlug,timezone,initialHours}:{businessSlug:string;timezone:string;initialHours?:DayHours[]}){
 const [state,action,pending]=useActionState(saveBusinessHours.bind(null,businessSlug),{} as BusinessHoursState);
 return <div className="onboarding-frame"><aside><span className="sv-kicker">Guided setup</span><h2>Set the rhythm of your week</h2><ol>{["Welcome","Company","Business profile","Hours","First service","Ready to go"].map((label,index)=><li className={index===3?"active":index<3?"complete":""} key={label}><i>{index<3?"✓":index+1}</i><span>{label}</span></li>)}</ol><p>These hours power public availability and scheduling. You can add exceptions and technician-specific availability later.</p></aside><section className="onboarding-card"><div className="onboarding-progress" aria-label="Step 4 of 6"><span style={{width:"66.67%"}}/></div><form action={action} className="onboarding-hours-form"><header><span className="sv-kicker">Step 4 of 6</span><h1>When are you open?</h1><p>All times are displayed in <strong>{timezone}</strong>. Database timestamps remain UTC.</p></header>{state.error&&<p className="auth-error" role="alert">{state.error}</p>}<BusinessHoursEditor initialHours={initialHours} fieldStyle="onboarding" dayErrors={state.dayErrors}/><div className="onboarding-actions"><Link className="sv-button sv-secondary" href="/app">Resume later</Link><button className="sv-button" disabled={pending}>{pending?"Saving hours…":"Save and continue"}</button></div></form></section></div>;
}
