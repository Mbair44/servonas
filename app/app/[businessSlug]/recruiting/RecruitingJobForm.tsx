"use client";
import {useState} from "react";
import {employmentTypes,normalizeJobSlug} from "@/lib/recruiting";

type Job={id?:string;title?:string;slug?:string;location?:string;employment_type?:string;compensation_text?:string|null;description?:string;qualifications?:string;status?:string};
export function RecruitingJobForm({action,job}:{action:(form:FormData)=>void;job?:Job}){
 const [title,setTitle]=useState(job?.title??""),[slug,setSlug]=useState(job?.slug??"");
 const generated=!job?.id||job.status==="draft";
 const updateTitle=(value:string)=>{setTitle(value);if(generated)setSlug(normalizeJobSlug(value));};
 return <form action={action} className="workspace-panel" style={{display:"grid",gap:16,maxWidth:900}}>
  <label>Job title<input required name="title" value={title} maxLength={180} onChange={event=>updateTitle(event.target.value)} /></label>
  <label>URL slug<input required name="slug" value={slug} maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={event=>setSlug(normalizeJobSlug(event.target.value))}/><small>{job?.status&&job.status!=="draft"?"Published and closed job URLs are fixed to protect shared links.":"Generated from the job title. Use lowercase words separated by hyphens."}</small></label>
  <div className="form-grid"><label>Location<input required name="location" defaultValue={job?.location??""} maxLength={240}/></label><label>Employment type<select required name="employmentType" defaultValue={job?.employment_type??""}><option value="">Select type</option>{employmentTypes.map(type=><option key={type} value={type}>{type.replaceAll("_"," ")}</option>)}</select></label></div>
  <label>Compensation<input name="compensation" defaultValue={job?.compensation_text??""} maxLength={1000} placeholder="e.g. $22–$26/hour, based on experience"/><small>Required before publishing.</small></label>
  <label>Job description<textarea required name="description" defaultValue={job?.description??""} rows={10} maxLength={30000}/><small>Plain text is used for now; it will be safely rendered on the public careers page.</small></label>
  <label>Qualifications<textarea name="qualifications" defaultValue={job?.qualifications??""} rows={7} maxLength={30000}/><small>Required before publishing.</small></label>
  <div className="settings-actions"><button className="sv-button sv-secondary" name="intent" value={job?.status==="published"||job?.status==="closed"?"save":"draft"}>{job?.id?"Save Changes":"Save Draft"}</button>{job?.status!=="closed"&&<button className="sv-button" name="intent" value="publish">Publish</button>}<a className="sv-button sv-secondary" href="../">Cancel</a></div>
 </form>;
}
