"use client";

import {useEffect,useState,type ReactNode} from "react";
import {WebsiteIcon} from "./WebsiteIcon";

const steps=[
 {key:"basic",title:"Basic Info",subtitle:"Your message and business details"},
 {key:"design",title:"Design",subtitle:"Template, colors, logo, and photos"},
 {key:"services",title:"Services",subtitle:"What customers can book"},
 {key:"hours",title:"Hours & Areas",subtitle:"When and where you work"},
 {key:"features",title:"Features",subtitle:"Booking, reviews, and social"},
 {key:"domain",title:"Domain",subtitle:"Your website address"},
 {key:"review",title:"Review & Publish",subtitle:"Check everything and go live"},
] as const;

type StepKey=typeof steps[number]["key"];
type Check={label:string;complete:boolean;detail:string};

export function WebsiteSetupWizard({children,previewUrl,initialStep="basic",checks,publishControl}:{children:ReactNode;previewUrl:string;initialStep?:string;checks:Check[];publishControl?:ReactNode}){
 const valid=steps.some(step=>step.key===initialStep),[active,setActive]=useState<StepKey>((valid?initialStep:"basic") as StepKey),[device,setDevice]=useState<"desktop"|"tablet"|"mobile">("desktop"),[previewOpen,setPreviewOpen]=useState(false),[previewVersion,setPreviewVersion]=useState(0);
 const index=steps.findIndex(step=>step.key===active);
 useEffect(()=>{
  const form=document.querySelector<HTMLFormElement>(".website-guided-form");
  if(!form)return;
  let field=form.querySelector<HTMLInputElement>('input[name="websiteStep"]');
  if(!field){field=document.createElement("input");field.type="hidden";field.name="websiteStep";form.appendChild(field);}
  field.value=steps[Math.min(index+1,steps.length-1)].key;
 },[active,index]);
 useEffect(()=>{const notice=document.querySelector<HTMLElement>(".website-dashboard>.workspace-notice.success");if(!notice)return;const timer=window.setTimeout(()=>notice.remove(),4000);return()=>window.clearTimeout(timer);},[]);
 useEffect(()=>{if(!previewOpen)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setPreviewOpen(false);};document.addEventListener("keydown",close);document.body.classList.add("website-preview-is-open");return()=>{document.removeEventListener("keydown",close);document.body.classList.remove("website-preview-is-open");};},[previewOpen]);
 const choose=(key:StepKey)=>{setActive(key);setPreviewOpen(false);window.history.replaceState(null,"",`${window.location.pathname}?step=${key}`);};
 const openPreview=()=>{setPreviewVersion(current=>current+1);setPreviewOpen(true);};
 return <div className={`website-builder-shell website-step-${active}`}>
  <aside className="website-setup-nav" aria-label="Website setup steps"><div><strong>Website setup</strong><span>Follow these steps to get online.</span></div><ol>{steps.map((step,stepIndex)=>{const complete=stepIndex<index||checks[stepIndex]?.complete;return <li key={step.key}><button type="button" className={active===step.key?"active":complete?"complete":""} onClick={()=>choose(step.key)} aria-current={active===step.key?"step":undefined}><i>{complete?<WebsiteIcon name="check"/>:stepIndex+1}</i><span><strong>{step.title}</strong><small>{step.subtitle}</small></span></button></li>;})}</ol></aside>
  <section className="website-step-editor"><header><span>Step {index+1} of {steps.length}</span><h2>{steps[index].title}</h2><p>{steps[index].subtitle}</p><button type="button" className="sv-button sv-secondary website-mobile-preview" onClick={openPreview}><WebsiteIcon name="eye"/> Preview</button></header>{active==="review"&&<><div className="website-review-summary"><h3>Ready to publish?</h3><p>Review the essentials below. You can return to any step to make changes.</p>{checks.map((check,checkIndex)=><button type="button" key={check.label} onClick={()=>choose(steps[Math.min(checkIndex,steps.length-1)].key)}><i className={check.complete?"complete":"attention"}><WebsiteIcon name={check.complete?"check":"alert"}/></i><span><strong>{check.label}</strong><small>{check.detail}</small></span><b>{check.complete?"Complete":"Needs attention"}</b></button>)}</div>{publishControl&&<div className="website-review-publish">{publishControl}</div>}</>}{children}</section>
  {previewOpen&&<button type="button" className="website-preview-backdrop" onClick={()=>setPreviewOpen(false)} aria-label="Close website preview"/>}<aside className={`website-live-preview ${previewOpen?"open":""}`}><header><div><strong>Live preview</strong><span>Saved website settings</span></div><nav aria-label="Preview size">{(["desktop","tablet","mobile"] as const).map(item=>{const name=item[0].toUpperCase()+item.slice(1);return <button type="button" key={item} className={device===item?"active":""} onClick={()=>setDevice(item)} aria-label={`${name} preview`} data-tooltip={`${name} preview`} title={`${name} preview`}>{item.slice(0,1).toUpperCase()}</button>;})}</nav><button type="button" className="website-preview-close" onClick={()=>setPreviewOpen(false)} aria-label="Close preview">×</button></header><div className={`website-preview-frame ${device}`}><iframe key={previewVersion} src={previewUrl} title="Website live preview"/></div></aside>
 </div>;
}
