"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { generatePublicDocumentToken,publicDocumentTokenHash } from "@/lib/publicDocumentToken";
import { parseCurrencyToCents } from "@/lib/financial/priceBook";
import { sendInvoiceFinancialEmail } from "@/lib/communications/invoiceEmailService";
import {processCompletedJobBilling} from "@/lib/financial/recurringBilling";
import { canTransitionJob, type JobStatus } from "@/lib/jobStatusTransitions";
import { jobStatuses } from "@/lib/jobValidation";
import {hasIndustryCapability} from "@/lib/industryCapabilities";
import {poolChemistryFields} from "@/lib/poolService";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

async function technicianJob(jobId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tech/jobs/${jobId}`)}`);
  const { data: profiles } = await supabase.from("technician_profiles").select("id").eq("member_user_id", user.id).eq("is_active", true).eq("is_technician", true);
  const technicianIds = (profiles ?? []).map((profile) => profile.id);
  if (!technicianIds.length) redirect("/tech?error=Technician+profile+not+found");
  const { data: job } = await supabase.from("jobs").select("id,business_id,assigned_technician_id,status").eq("id", jobId).in("assigned_technician_id", technicianIds).eq("is_deleted", false).maybeSingle();
  if (!job) redirect("/tech?error=Assigned+job+not+found");
  return { supabase, user, job };
}

export async function transitionTechnicianJob(jobId: string, formData: FormData) {
  const { supabase, job } = await technicianJob(jobId);
  const status = text(formData, "status");
  const requestedReturn = text(formData, "returnTo");
  const returnTo = requestedReturn.startsWith("/tech/route") ? requestedReturn : `/tech/jobs/${jobId}`;
  const redirectWith = (kind: "error" | "success", message: string) =>
    `${returnTo}${returnTo.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`;
  const currentStatus = String(job.status) as JobStatus;
  if (status === "in_progress" && currentStatus !== "arrived") {
    redirect(redirectWith("error", "Start Job is only available after your location confirms you have arrived."));
  }
  if (!jobStatuses.includes(status as JobStatus) || !canTransitionJob(currentStatus, status as JobStatus)) {
    redirect(redirectWith("error", "This job changed since the page loaded. Refresh and try the action shown."));
  }
  if(status==="completed"){
    const [{data:business},{data:details}]=await Promise.all([supabase.from("businesses").select("industry_profile").eq("id",job.business_id).maybeSingle(),supabase.from("jobs").select("recurring_service_series_id").eq("business_id",job.business_id).eq("id",jobId).maybeSingle()]);
    if(details?.recurring_service_series_id&&hasIndustryCapability(business?.industry_profile,"poolServiceLogs")){
      const {data:poolLog}=await supabase.from("pool_service_logs").select("status").eq("business_id",job.business_id).eq("job_id",jobId).maybeSingle();
      if(poolLog?.status!=="completed")redirect(redirectWith("error","Complete the Pool Service chemistry and service log before completing this recurring visit."));
    }
  }
  // A repeated tap may arrive after the first request has already succeeded.
  if (currentStatus === status) redirect(redirectWith("success", "Job status updated."));
  const { error } = await supabase.rpc("transition_assigned_job_status", { p_job_id: jobId, p_status: status });
  if (error) {
    console.error("Technician status transition failed", {
      code: error.code,
      details: error.details,
      hint: error.hint,
      jobId,
      message: error.message,
      requestedStatus: status,
      status: currentStatus,
    });
    const message = error.code === "42501"
      ? "This job is no longer assigned to your technician account."
      : error.code === "23514"
        ? "This job changed since the page loaded. Refresh and try again."
        : "The job status could not be updated. Refresh and try again.";
    redirect(redirectWith("error", message));
  }
  if(status==="completed"){
    const billing=await processCompletedJobBilling(jobId);
    if(!billing.ok)console.error("Technician completed-job billing orchestration failed",{jobId,reason:billing.error});
  }
  revalidatePath("/tech"); revalidatePath("/tech/route"); revalidatePath(`/tech/jobs/${jobId}`);
  redirect(redirectWith("success", "Job status updated."));
}

export async function addTechnicianNote(jobId: string, formData: FormData) {
  const { supabase } = await technicianJob(jobId);
  const note = text(formData, "note");
  if (!note || note.length > 4000) redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("Enter a note under 4,000 characters.")}`);
  const { error } = await supabase.rpc("append_assigned_job_note", { p_job_id: jobId, p_note: note });
  if (error) {
    console.error("Technician note append failed", { code: error.code, jobId });
    redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("The note could not be added.")}`);
  }
  revalidatePath(`/tech/jobs/${jobId}`);
  redirect(`/tech/jobs/${jobId}?success=${encodeURIComponent("Note added.")}`);
}

export async function savePoolServiceLog(jobId:string,formData:FormData){
 const {supabase,user,job}=await technicianJob(jobId);
 const {data:business}=await supabase.from("businesses").select("industry_profile").eq("id",job.business_id).maybeSingle();
 if(!hasIndustryCapability(business?.industry_profile,"poolServiceLogs"))redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("Pool service logs are not enabled for this workspace.")}`);
 const {data:jobDetails}=await supabase.from("jobs").select("customer_id,service_location_id,assigned_technician_id").eq("id",jobId).eq("business_id",job.business_id).maybeSingle();
 if(!jobDetails?.customer_id||!jobDetails.service_location_id)redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("This job needs a customer and service location before a pool log can be saved.")}`);
 const numeric=(key:string)=>{const value=text(formData,key);if(!value)return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null};
 const payload:Record<string,unknown>={business_id:job.business_id,job_id:jobId,customer_id:jobDetails.customer_id,service_location_id:jobDetails.service_location_id,technician_id:jobDetails.assigned_technician_id,status:text(formData,"submission")==="completed"?"completed":"draft",notes:text(formData,"notes")||null,updated_by:user.id,completed_at:text(formData,"submission")==="completed"?new Date().toISOString():null};
 for(const [key] of poolChemistryFields)payload[key]=numeric(key);
 const {data:log,error}=await supabase.from("pool_service_logs").upsert({...payload,created_by:user.id},{onConflict:"business_id,job_id"}).select("id").single();
 if(error||!log)redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent(`Pool service log could not be saved (${error?.code??"unknown"}).`)}`);
 await Promise.all([supabase.from("pool_service_log_checklist").delete().eq("business_id",job.business_id).eq("pool_service_log_id",log.id),supabase.from("pool_service_log_chemicals").delete().eq("business_id",job.business_id).eq("pool_service_log_id",log.id)]);
 const completedIds=formData.getAll("completedTask").map(String),savedIds=completedIds.filter(id=>!id.startsWith("label:"));
 const {data:tasks}=savedIds.length?await supabase.from("pool_checklist_templates").select("id,label").eq("business_id",job.business_id).in("id",savedIds):{data:[]};
 const taskRows=[...(tasks??[]).map(task=>({checklist_template_id:task.id,task_label:task.label})),...completedIds.filter(id=>id.startsWith("label:")).map(id=>({checklist_template_id:null,task_label:id.slice(6)}))];
 if(taskRows.length)await supabase.from("pool_service_log_checklist").insert(taskRows.map(task=>({business_id:job.business_id,pool_service_log_id:log.id,...task,completed:true,completed_at:new Date().toISOString()})));
 const ids=formData.getAll("chemicalId").map(String),custom=formData.getAll("chemicalCustom").map(String),amount=formData.getAll("chemicalAmount").map(String),units=formData.getAll("chemicalUnit").map(String),cost=formData.getAll("chemicalCost").map(String);
 const catalogIds=ids.filter(id=>id&&id!=="custom"&&!id.startsWith("name:"));const {data:catalog}=catalogIds.length?await supabase.from("pool_chemical_catalog").select("id,name").eq("business_id",job.business_id).in("id",catalogIds):{data:[]};
 const rows=ids.flatMap((id,index)=>{const name=id==="custom"?custom[index]?.trim():id.startsWith("name:")?id.slice(5):catalog?.find(item=>item.id===id)?.name;const quantity=Number(amount[index]);if(!name||!Number.isFinite(quantity)||quantity<=0||!units[index]?.trim())return [];return [{business_id:job.business_id,pool_service_log_id:log.id,chemical_catalog_id:id!=="custom"&&!id.startsWith("name:")?id:null,chemical_name:name,amount:quantity,unit:units[index].trim(),estimated_cost_cents:cost[index]?Math.round(Number(cost[index])*100):null}]});
 if(rows.length)await supabase.from("pool_service_log_chemicals").insert(rows);
 revalidatePath(`/tech/jobs/${jobId}`);redirect(`/tech/jobs/${jobId}?success=${encodeURIComponent(payload.status==="completed"?"Pool service log completed.":"Pool service draft saved.")}`);
}

export async function uploadTechnicianPhoto(jobId: string, formData: FormData) {
  const { supabase, user, job } = await technicianJob(jobId);
  const file = formData.get("photo");
  if (!(file instanceof File) || !file.size) redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("Choose a photo.")}`);
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  if (file.size > 10 * 1024 * 1024 || !allowed.includes(file.type)) {
    redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("Use a JPG, PNG, WebP, or HEIC photo under 10MB.")}`);
  }
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${job.business_id}/${jobId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("job-photos").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("Technician photo upload failed", { code: uploadError.name, businessId: job.business_id, jobId });
    redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("The photo could not be uploaded.")}`);
  }
  const { error } = await supabase.from("job_photos").insert({
    business_id: job.business_id, job_id: jobId, storage_path: path,
    caption: text(formData, "caption") || null,
    photo_type: ["before", "after", "general"].includes(text(formData, "photoType")) ? text(formData, "photoType") : "general",
    uploaded_by: user.id,
  });
  if (error) {
    await supabase.storage.from("job-photos").remove([path]);
    console.error("Technician photo metadata failed", { code: error.code, businessId: job.business_id, jobId });
    redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("The photo could not be saved.")}`);
  }
  revalidatePath(`/tech/jobs/${jobId}`);
  redirect(`/tech/jobs/${jobId}?success=${encodeURIComponent("Photo added.")}`);
}

export async function removeTechnicianPhoto(jobId: string, formData: FormData) {
  const { supabase, user, job } = await technicianJob(jobId);
  const photoId = text(formData, "photoId");
  const { data: photo, error: lookupError } = await supabase.from("job_photos")
    .select("id,storage_path").eq("id", photoId).eq("job_id", jobId)
    .eq("business_id", job.business_id).eq("uploaded_by", user.id).maybeSingle();
  if (lookupError || !photo) {
    console.error("Technician photo lookup failed", { code: lookupError?.code, businessId: job.business_id, jobId });
    redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("Only photos you uploaded can be removed.")}`);
  }
  const { error } = await supabase.from("job_photos").delete().eq("id", photo.id);
  if (error) {
    console.error("Technician photo removal failed", { code: error.code, businessId: job.business_id, jobId });
    redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("The photo could not be removed.")}`);
  }
  const { error: storageError } = await supabase.storage.from("job-photos").remove([photo.storage_path]);
  if (storageError) console.warn("Technician photo storage cleanup failed", { code: storageError.name, businessId: job.business_id, jobId });
  revalidatePath(`/tech/jobs/${jobId}`);
  redirect(`/tech/jobs/${jobId}?success=${encodeURIComponent("Photo removed.")}`);
}

export async function generateTechnicianInvoice(jobId:string){
  const {supabase}=await technicianJob(jobId);
  const {error}=await supabase.rpc("technician_generate_job_invoice",{p_job_id:jobId});
  if(error){console.error("Technician invoice generation failed",{code:error.code,jobId});redirect(`/tech/jobs/${jobId}?error=Draft+invoice+could+not+be+generated`);}
  revalidatePath(`/tech/jobs/${jobId}`);redirect(`/tech/jobs/${jobId}?success=Draft+invoice+ready`);
}

export async function addTechnicianInvoiceItem(jobId:string,data:FormData){
  const {supabase}=await technicianJob(jobId);
  const quantity=Number(text(data,"quantity"));
  const {error}=await supabase.rpc("technician_add_invoice_item",{p_job_id:jobId,p_item_id:text(data,"itemId"),p_quantity:quantity});
  if(error){console.error("Technician invoice item failed",{code:error.code,jobId});redirect(`/tech/jobs/${jobId}?error=Approved+item+could+not+be+added`);}
  revalidatePath(`/tech/jobs/${jobId}`);redirect(`/tech/jobs/${jobId}?success=Invoice+item+added`);
}

export async function presentTechnicianInvoice(jobId:string){
  const {supabase}=await technicianJob(jobId);
  const token=generatePublicDocumentToken(),hash=await publicDocumentTokenHash(token);
  const {data:invoiceId,error}=await supabase.rpc("technician_present_job_invoice",{p_job_id:jobId,p_token_hash:hash,p_expires_at:new Date(Date.now()+365*86400000).toISOString()});
  if(error){console.error("Technician invoice presentation failed",{code:error.code,jobId});redirect(`/tech/jobs/${jobId}?error=Invoice+must+contain+approved+pricing+before+it+can+be+presented`);}
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000").replace(/\/$/,"");
  if(invoiceId)await sendInvoiceFinancialEmail(String(invoiceId),"payment_link_sent",{publicUrl:`${origin}/invoice/${token}`});
  revalidatePath(`/tech/jobs/${jobId}`);redirect(`/tech/jobs/${jobId}?success=Payment+link+ready&paymentLink=${encodeURIComponent(`${origin}/invoice/${token}`)}`);
}

export async function recordTechnicianPayment(jobId:string,data:FormData){
  const {supabase}=await technicianJob(jobId);
  const amount=parseCurrencyToCents(text(data,"amount")),method=text(data,"method"),key=text(data,"requestKey");
  if(amount===null||amount<=0||!["cash","check"].includes(method))redirect(`/tech/jobs/${jobId}?error=Enter+a+valid+cash+or+check+payment`);
  const {data:paymentId,error}=await supabase.rpc("technician_record_job_payment",{p_job_id:jobId,p_amount:amount,p_method:method,p_received_at:new Date().toISOString(),p_reference:text(data,"reference"),p_key:key});
  if(error){console.error("Technician payment failed",{code:error.code,jobId});redirect(`/tech/jobs/${jobId}?error=Payment+could+not+be+recorded`);}
  const {data:invoice}=await supabase.from("invoices").select("id,status").eq("job_id",jobId).maybeSingle();
  if(invoice&&paymentId){await sendInvoiceFinancialEmail(invoice.id,invoice.status==="paid"?"invoice_paid":"partial_payment",{paymentId:String(paymentId)});await sendInvoiceFinancialEmail(invoice.id,"receipt_sent",{paymentId:String(paymentId)});}
  revalidatePath(`/tech/jobs/${jobId}`);redirect(`/tech/jobs/${jobId}?success=Payment+recorded`);
}
