"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageRecruiting} from "@/lib/access";
import {defaultApplicantRetentionDays,defaultRecruitingPrivacyNoticeVersion,isEmploymentType,normalizeJobSlug} from "@/lib/recruiting";
import {requireWorkspace} from "@/lib/workspace";

const text=(form:FormData,key:string)=>String(form.get(key)??"").trim();
const checked=(form:FormData,key:string)=>form.get(key)==="on";
const destination=(slug:string,path:string,kind:"error"|"success",message:string)=>`/app/${encodeURIComponent(slug)}/recruiting${path}?${kind}=${encodeURIComponent(message)}`;

async function recruitingWorkspace(slug:string){
 const context=await requireWorkspace(slug);
 if(!canManageRecruiting(context.role))redirect(`/app/${encodeURIComponent(slug)}`);
 return context;
}

function jobValues(form:FormData){
 const title=text(form,"title"),slug=normalizeJobSlug(text(form,"slug")||title),location=text(form,"location"),employmentType=text(form,"employmentType"),compensation=text(form,"compensation"),description=text(form,"description"),qualifications=text(form,"qualifications");
 return {title,slug,location,employmentType,compensation,description,qualifications};
}
function draftError(value:ReturnType<typeof jobValues>){
 if(!value.title||!value.slug||!value.location||!value.description||!isEmploymentType(value.employmentType))return "Add a title, URL slug, location, employment type, and description before saving a draft.";
 return null;
}
function publishError(value:ReturnType<typeof jobValues>){
 const base=draftError(value);if(base)return base;
 if(!value.compensation||!value.qualifications)return "Add compensation and qualifications before publishing this job.";
 return null;
}

export async function saveJobPosting(slug:string,jobId:string|undefined,form:FormData){
 const {supabase,business,user}=await recruitingWorkspace(slug),intent=text(form,"intent"),value=jobValues(form),editing=Boolean(jobId);
 const target=editing?`/jobs/${encodeURIComponent(jobId!)}`:"/jobs/new";
 if(!value.slug)return redirect(destination(slug,target,"error","Enter a URL slug."));
 const {data:existing}=editing?await supabase.from("job_postings").select("id,status,slug").eq("business_id",business.id).eq("id",jobId!).maybeSingle():{data:null};
 if(editing&&!existing)return redirect(destination(slug,"","error","Job posting not found."));
 if(existing&&existing.status!=="draft"&&existing.slug!==value.slug)return redirect(destination(slug,target,"error","Published and closed job URLs cannot be changed."));
 const error=intent==="publish"?publishError(value):draftError(value);
 if(error)return redirect(destination(slug,target,"error",error));
 const now=new Date().toISOString(),status=intent==="publish"?"published":existing?.status==="published"?"published":existing?.status==="closed"?"closed":"draft";
 const payload={business_id:business.id,...value,status,published_at:status==="published"?(existing?.status==="published"?undefined:now):null,closed_at:status==="closed"?undefined:null,updated_at:now,updated_by:user.id,...(!editing?{created_by:user.id}: {})};
 if(editing){
  const {error:writeError}=await supabase.from("job_postings").update(payload).eq("business_id",business.id).eq("id",jobId!);
  if(writeError)return redirect(destination(slug,target,"error",writeError.code==="23505"?"That job URL is already in use.":"Job posting could not be saved."));
 }else{
  const {data:created,error:writeError}=await supabase.from("job_postings").insert(payload).select("id").single();
  if(writeError||!created)return redirect(destination(slug,target,"error",writeError?.code==="23505"?"That job URL is already in use.":"Job posting could not be created."));
  revalidatePath(`/app/${slug}/recruiting`);
  return redirect(destination(slug,`/jobs/${created.id}`,"success",status==="published"?"Job posting published.":"Draft saved."));
 }
 revalidatePath(`/app/${slug}/recruiting`);revalidatePath(`/app/${slug}/recruiting/jobs/${jobId}`);
 redirect(destination(slug,target,"success",status==="published"?"Job posting published.":"Changes saved."));
}

export async function closeJobPosting(slug:string,jobId:string){
 const {supabase,business,user}=await recruitingWorkspace(slug),now=new Date().toISOString();
 const {data,error}=await supabase.from("job_postings").update({status:"closed",closed_at:now,updated_at:now,updated_by:user.id}).eq("business_id",business.id).eq("id",jobId).eq("status","published").select("id").maybeSingle();
 if(error||!data)return redirect(destination(slug,`/jobs/${jobId}`,"error","Only a published job can be closed."));
 revalidatePath(`/app/${slug}/recruiting`);revalidatePath(`/app/${slug}/recruiting/jobs/${jobId}`);
 redirect(destination(slug,`/jobs/${jobId}`,"success","Job posting closed. Existing applications were preserved."));
}

export async function publishExistingJobPosting(slug:string,jobId:string){
 const {supabase,business,user}=await recruitingWorkspace(slug);
 const {data:job}=await supabase.from("job_postings").select("title,slug,location,employment_type,compensation_text,description,qualifications,status").eq("business_id",business.id).eq("id",jobId).maybeSingle();
 if(!job)return redirect(destination(slug,"","error","Job posting not found."));
 if(job.status!=="draft")return redirect(destination(slug,"","error","Only draft job postings can be published."));
 const error=publishError({title:job.title,slug:job.slug,location:job.location,employmentType:job.employment_type,compensation:job.compensation_text??"",description:job.description,qualifications:job.qualifications});
 if(error)return redirect(destination(slug,`/jobs/${jobId}`,"error",error));
 const {error:writeError}=await supabase.from("job_postings").update({status:"published",published_at:new Date().toISOString(),updated_by:user.id}).eq("business_id",business.id).eq("id",jobId).eq("status","draft");
 if(writeError)return redirect(destination(slug,`/jobs/${jobId}`,"error","Job posting could not be published."));
 revalidatePath(`/app/${slug}/recruiting`);revalidatePath(`/app/${slug}/recruiting/jobs/${jobId}`);
 redirect(destination(slug,`/jobs/${jobId}`,"success","Job posting published."));
}

export async function saveRecruitingSettings(slug:string,form:FormData){
 const {supabase,business,user}=await recruitingWorkspace(slug),retention=Number(text(form,"applicantRetentionDays")||defaultApplicantRetentionDays),email=text(form,"notificationEmail").toLowerCase()||null;
 if(!Number.isInteger(retention)||retention<30||retention>3650)return redirect(destination(slug,"/settings","error","Retention must be between 30 and 3,650 days."));
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return redirect(destination(slug,"/settings","error","Enter a valid notification email."));
 const {error}=await supabase.from("business_recruiting_settings").upsert({business_id:business.id,careers_enabled:checked(form,"careersEnabled"),show_careers_nav_link:checked(form,"showCareersNavLink"),show_careers_footer_link:checked(form,"showCareersFooterLink"),notification_email:email,applicant_retention_days:retention,privacy_notice_version:defaultRecruitingPrivacyNoticeVersion,updated_by:user.id},{onConflict:"business_id"});
 if(error)return redirect(destination(slug,"/settings","error","Careers settings could not be saved."));
 revalidatePath(`/app/${slug}/recruiting/settings`);redirect(destination(slug,"/settings","success","Careers settings saved. Public routes are not live yet."));
}
