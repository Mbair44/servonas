"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";

const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const money=(value:string)=>{ const parsed=Number(value||0); return Number.isFinite(parsed)&&parsed>=0?parsed:0; };
const dateOrNull=(value:string)=>value?new Date(value).toISOString():null;

export async function createJob(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role)) redirect(`/app/${slug}/jobs?error=Permission+denied`);
 const title=text(formData,"title"),customerId=text(formData,"customerId"),starts=text(formData,"startsAt"),ends=text(formData,"endsAt");
 if(!title) redirect(`/app/${slug}/jobs?error=Job+title+is+required`);
 if(starts&&ends&&new Date(ends)<new Date(starts)) redirect(`/app/${slug}/jobs?error=End+time+must+be+after+start+time`);
 const {data,error}=await supabase.from("jobs").insert({business_id:business.id,customer_id:customerId||null,title,status:text(formData,"status")||"draft",starts_at:dateOrNull(starts),ends_at:dateOrNull(ends),service_address:text(formData,"serviceAddress")||null,description:text(formData,"description")||null,internal_notes:text(formData,"internalNotes")||null,subtotal:money(text(formData,"subtotal")),tax_amount:money(text(formData,"taxAmount")),created_by:user.id,updated_by:user.id}).select("id").single();
 if(error){ console.error("Job creation failed",error); redirect(`/app/${slug}/jobs?error=${encodeURIComponent("We couldn’t create the job. Please check the details and try again.")}`); }
 revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/jobs`); redirect(`/app/${slug}/jobs/${data.id}?success=Job+created`);
}

export async function updateJob(slug:string,jobId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role)) redirect(`/app/${slug}/jobs/${jobId}?error=Permission+denied`);
 const starts=text(formData,"startsAt"),ends=text(formData,"endsAt");
 if(starts&&ends&&new Date(ends)<new Date(starts)) redirect(`/app/${slug}/jobs/${jobId}?error=End+time+must+be+after+start+time`);
 const {error}=await supabase.from("jobs").update({customer_id:text(formData,"customerId")||null,title:text(formData,"title"),status:text(formData,"status"),starts_at:dateOrNull(starts),ends_at:dateOrNull(ends),service_address:text(formData,"serviceAddress")||null,description:text(formData,"description")||null,internal_notes:text(formData,"internalNotes")||null,subtotal:money(text(formData,"subtotal")),tax_amount:money(text(formData,"taxAmount")),updated_at:new Date().toISOString(),updated_by:user.id}).eq("id",jobId).eq("business_id",business.id);
 if(error){ console.error("Job update failed",error); redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("We couldn’t save the job. Please try again.")}`); }
 revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/jobs`); revalidatePath(`/app/${slug}/jobs/${jobId}`); redirect(`/app/${slug}/jobs/${jobId}?success=Job+updated`);
}

export async function archiveJob(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role)) redirect(`/app/${slug}/jobs?error=Permission+denied`);
 const id=text(formData,"jobId");
 const {error}=await supabase.from("jobs").update({is_deleted:true,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",id).eq("business_id",business.id);
 if(error) redirect(`/app/${slug}/jobs?error=${encodeURIComponent("We couldn’t archive the job.")}`);
 revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/jobs`); redirect(`/app/${slug}/jobs?success=Job+archived`);
}
