"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import { JobNotificationService } from "@/lib/communications/jobNotificationService";
import {processCompletedJobBilling} from "@/lib/financial/recurringBilling";
import { zonedDateTimeToUtc } from "@/lib/bookingTime";
import { checkJobSchedule, validateJobSchedule } from "@/lib/jobScheduling";
import { jobPriorities, jobStatuses, nonNegativeMoney, paymentStatuses, validateJobTimes } from "@/lib/jobValidation";
import { canTransitionJob, type JobStatus } from "@/lib/jobStatusTransitions";
import { requireWorkspaceCapability } from "@/lib/workspace";

export type JobActionState = { error?: string; warning?: string; fieldErrors?: Record<string, string>; values?: Record<string, string>; technicianIds?: string[] };
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const valuesFrom = (formData: FormData) => Object.fromEntries(
  [...formData.entries()].filter(([, value]) => typeof value === "string"),
) as Record<string, string>;
const technicianIdsFrom = (formData: FormData) => {
  const selected=[...new Set(formData.getAll("technicianIds").map(String).filter(Boolean))];
  const legacy=text(formData,"technicianId");
  return selected.length||formData.has("technicianIds")?selected:legacy?[legacy]:[];
};
const localDate = (value: string, timeZone: string) => {
  if (!value) return null;
  const [date, time] = value.split("T");
  if (!date || !time) return null;
  const parsed = zonedDateTimeToUtc(date, time.slice(0, 5), timeZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

async function ownedRecord(
  supabase: Awaited<ReturnType<typeof requireWorkspaceCapability>>["supabase"],
  table: "customers" | "service_locations" | "services" | "technician_profiles",
  id: string,
  businessId: string,
) {
  if (!id) return null;
  let query = supabase.from(table).select("*").eq("id", id).eq("business_id", businessId);
  if (table !== "technician_profiles") query = query.eq("is_deleted", false);
  else query = query.eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true);
  const { data } = await query.maybeSingle();
  return data;
}

async function prepareJob(
  formData: FormData,
  context: Awaited<ReturnType<typeof requireWorkspaceCapability>>,
  excludeJobId?: string,
  allowMinimumNoticeOverride = false,
) {
  const { supabase, business } = context;
  const values = valuesFrom(formData);
  const errors: Record<string, string> = {};
  const title = text(formData, "title");
  const customerId = text(formData, "customerId");
  const locationId = text(formData, "serviceLocationId");
  const serviceId = text(formData, "serviceId");
  const technicianIds = technicianIdsFrom(formData);
  const technicianId = technicianIds[0] ?? "";
  const scheduleCommitment=text(formData,"scheduleCommitment")==="flexible"?"flexible":"fixed";
  const isReturnVisit=formData.get("isReturnVisit")==="on",returnVisitForJobId=isReturnVisit?text(formData,"returnVisitForJobId"):"";
  const startsAt = localDate(text(formData, "startsAt"), business.timezone);
  const endsAt = localDate(text(formData, "endsAt"), business.timezone);
  const arrivalStart = localDate(text(formData, "arrivalWindowStart"), business.timezone);
  const arrivalEnd = localDate(text(formData, "arrivalWindowEnd"), business.timezone);
  if (!title) errors.title = "Enter a job title.";
  if (!customerId) errors.customerId = "Choose a customer.";
  const timeError = validateJobTimes(startsAt, endsAt, arrivalStart, arrivalEnd);
  if (timeError) {
    if (startsAt && !endsAt) errors.endsAt = timeError;
    else if (!startsAt && endsAt) errors.startsAt = timeError;
    else if (arrivalStart && !arrivalEnd) errors.arrivalWindowEnd = timeError;
    else if (!arrivalStart && arrivalEnd) errors.arrivalWindowStart = timeError;
    else if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = timeError;
    else if (arrivalStart && arrivalEnd && arrivalEnd < arrivalStart) errors.arrivalWindowEnd = timeError;
    else errors.startsAt = timeError;
  }
  const subtotal = nonNegativeMoney(text(formData, "subtotal"));
  const tax = nonNegativeMoney(text(formData, "taxAmount"));
  const discount = nonNegativeMoney(text(formData, "discountAmount"));
  if (subtotal === null || tax === null || discount === null) errors.money = "Amounts cannot be negative.";
  const status = text(formData, "status");
  const priority = text(formData, "priority");
  const paymentStatus = text(formData, "paymentStatus");
  if (!jobStatuses.includes(status as typeof jobStatuses[number])) errors.status = "Choose a valid status.";
  if (!jobPriorities.includes(priority as typeof jobPriorities[number])) errors.priority = "Choose a valid priority.";
  if (!paymentStatuses.includes(paymentStatus as typeof paymentStatuses[number])) errors.paymentStatus = "Choose a valid payment status.";
  if (Object.keys(errors).length) return { error: "Please correct the highlighted fields.", errors, values, technicianIds };

  const [customer, location, service, technicianRows] = await Promise.all([
    ownedRecord(supabase, "customers", customerId, business.id),
    ownedRecord(supabase, "service_locations", locationId, business.id),
    ownedRecord(supabase, "services", serviceId, business.id),
    technicianIds.length ? supabase.from("technician_profiles").select("id").eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true).in("id", technicianIds) : Promise.resolve({ data: [] }),
  ]);
  if (!customer) errors.customerId = "Customer does not belong to this business.";
  if (locationId && (!location || location.customer_id !== customerId)) errors.serviceLocationId = "Location does not belong to this customer.";
  if (serviceId && !service) errors.serviceId = "Service does not belong to this business.";
  if ((technicianRows.data?.length ?? 0) !== technicianIds.length) errors.technicianIds = "One or more technicians are not assignable.";
  if (Object.keys(errors).length) return { error: "One or more selections are invalid.", errors, values, technicianIds };
  if(returnVisitForJobId){
    const {data:originalJob}=await supabase.from("jobs").select("id,customer_id,starts_at").eq("business_id",business.id).eq("id",returnVisitForJobId).eq("is_deleted",false).maybeSingle();
    if(!originalJob||originalJob.customer_id!==customerId||originalJob.id===excludeJobId||(startsAt&&originalJob.starts_at&&new Date(originalJob.starts_at)>=startsAt))return {error:"Choose an earlier job for the same customer.",errors:{returnVisitForJobId:"The original job must be an earlier job for this customer."},values};
  }
  const schedulingChecks = scheduleCommitment==="fixed" ? await Promise.all(technicianIds.map(id => checkJobSchedule({
    supabase, businessId: business.id, timeZone: business.timezone,
    startsAt, endsAt, arrivalWindowStart: arrivalStart, arrivalWindowEnd: arrivalEnd,
    technicianId: id, excludeJobId,
  }))) : [];
  const schedulingCheck = schedulingChecks.find(result => !result.available) ?? null;
  if(schedulingCheck&&!schedulingCheck.available){
    const schedulingMessage=schedulingCheck.message??"The requested schedule is unavailable.";
    const isMinimumNotice=schedulingMessage==="The requested time does not meet the minimum scheduling notice.";
    if(!(allowMinimumNoticeOverride&&isMinimumNotice&&text(formData,"overrideMinimumNotice")==="true")){
      if(allowMinimumNoticeOverride&&isMinimumNotice)return {warning:schedulingMessage,values,technicianIds};
      return {error:schedulingMessage,errors:{startsAt:schedulingMessage},values,technicianIds};
    }
  }
  const estimatedDuration = Number(text(formData, "estimatedDurationMinutes") || 0);
  return {
    values,
    technicianIds,
    technicianId: technicianId || null,
    payload: {
      customer_id: customerId,
      service_location_id: locationId || null,
      service_id: serviceId || null,
      title,
      description: text(formData, "description") || null,
      internal_notes: text(formData, "internalNotes") || null,
      customer_notes: text(formData, "customerNotes") || null,
      status,
      priority,
      schedule_commitment:scheduleCommitment,
      starts_at: startsAt?.toISOString() ?? null,
      ends_at: endsAt?.toISOString() ?? null,
      arrival_window_start: arrivalStart?.toISOString() ?? null,
      arrival_window_end: arrivalEnd?.toISOString() ?? null,
      estimated_duration_minutes: estimatedDuration > 0 ? estimatedDuration : null,
      service_address: location ? [location.street_address, location.unit, location.city, location.state, location.postal_code].filter(Boolean).join(", ") : text(formData, "serviceAddress") || null,
      subtotal: subtotal ?? 0,
      tax_amount: tax ?? 0,
      discount_amount: discount ?? 0,
      payment_status: paymentStatus,
      booking_source: text(formData, "source") || "dashboard",
      is_return_visit:isReturnVisit,
      return_visit_for_job_id:returnVisitForJobId||null,
      return_visit_reason:isReturnVisit?(text(formData,"returnVisitReason")||null):null,
    },
  };
}

export async function createJob(slug: string, _state: JobActionState, formData: FormData): Promise<JobActionState> {
  const context = await requireWorkspaceCapability(slug,"job_management");
  const { supabase, user, business, role } = context;
  const values = valuesFrom(formData);
  if (!canManageCustomers(role)) return { error: "You do not have permission to create jobs.", values };
  const requestKey = text(formData, "requestKey");
  if (!/^[0-9a-f-]{36}$/i.test(requestKey)) return { error: "Refresh the page before submitting.", values };
  const { data: existing } = await supabase.from("jobs").select("id").eq("business_id", business.id).eq("request_key", requestKey).maybeSingle();
  if (existing) redirect(`/app/${slug}/jobs/${existing.id}`);
  const prepared = await prepareJob(formData, context, undefined, true);
  if (!("payload" in prepared)) return { error: prepared.error, warning: prepared.warning, fieldErrors: prepared.errors, values: prepared.values, technicianIds: prepared.technicianIds };
  const payload = prepared.payload!;
  const { data: job, error } = await supabase.from("jobs").insert({
    ...payload, business_id: business.id, request_key: requestKey,
    created_by: user.id, updated_by: user.id,
  }).select("id").single();
  if (error || !job) {
    if (error?.code === "23505") {
      const { data: winner } = await supabase.from("jobs").select("id").eq("business_id", business.id).eq("request_key", requestKey).maybeSingle();
      if (winner) redirect(`/app/${slug}/jobs/${winner.id}`);
    }
    console.error("Office job creation failed", { code: error?.code, businessId: business.id });
    return { error: "The job could not be created.", values };
  }
  const { error: assignmentError } = await supabase.rpc("set_job_technicians", { p_job_id: job.id, p_technician_ids: prepared.technicianIds });
  if (assignmentError) console.error("Initial job assignment failed", { code: assignmentError.code, businessId: business.id, jobId: job.id });
  await Promise.allSettled([
    JobNotificationService.jobBooked(job.id),
    payload.status === "confirmed" ? JobNotificationService.jobConfirmed(job.id) : Promise.resolve(),
    prepared.technicianId ? JobNotificationService.technicianAssigned(job.id) : Promise.resolve(),
  ]);
  revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/jobs`);
  redirect(`/app/${slug}/jobs/${job.id}?success=Job+created`);
}

export async function updateJob(slug: string, jobId: string, _state: JobActionState, formData: FormData): Promise<JobActionState> {
  const context = await requireWorkspaceCapability(slug,"job_management");
  const { supabase, user, business, role } = context;
  const values = valuesFrom(formData);
  if (!canManageCustomers(role)) return { error: "You do not have permission to edit jobs.", values };
  const { data: owned } = await supabase.from("jobs").select("id,status,starts_at,ends_at,assigned_technician_id").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!owned) return { error: "Job not found.", values };
  const prepared = await prepareJob(formData, context, jobId);
  if (!("payload" in prepared)) return { error: prepared.error, fieldErrors: prepared.errors, values: prepared.values, technicianIds: prepared.technicianIds };
  const payload = prepared.payload!;
  const { error } = await supabase.from("jobs").update({ ...payload, updated_by: user.id }).eq("id", jobId).eq("business_id", business.id);
  if (error) {
    console.error("Office job update failed", { code: error.code, businessId: business.id, jobId });
    return { error: "The job could not be saved.", values };
  }
  const { error: assignmentError } = await supabase.rpc("set_job_technicians", { p_job_id: jobId, p_technician_ids: prepared.technicianIds });
  if (assignmentError) return { error: "Job details saved, but technician assignment could not be updated.", values };
  await Promise.allSettled([
    prepared.technicianId && prepared.technicianId !== owned.assigned_technician_id
      ? JobNotificationService.technicianAssigned(jobId) : Promise.resolve(),
    payload.starts_at !== owned.starts_at || payload.ends_at !== owned.ends_at
      ? JobNotificationService.jobRescheduled(jobId) : Promise.resolve(),
    payload.status === "confirmed" && owned.status !== "confirmed"
      ? JobNotificationService.jobConfirmed(jobId) : Promise.resolve(),
  ]);
  revalidatePath(`/app/${slug}/jobs`); revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(`/app/${slug}/jobs/${jobId}?success=Job+updated`);
}

export async function assignJobTechnician(slug: string, jobId: string, formData: FormData) {
  const { supabase, business, role } = await requireWorkspaceCapability(slug,"job_management");
  if (!canManageCustomers(role)) {
    redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("Your workspace role does not allow job assignment. Ask an owner or admin to grant manager access.")}`);
  }
  const technicianIds = technicianIdsFrom(formData);
  const technicianId = technicianIds[0] ?? null;
  const { data: job, error: jobError } = await supabase.from("jobs")
    .select("id,starts_at,ends_at,arrival_window_start,arrival_window_end,assigned_technician_id,schedule_commitment")
    .eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (jobError || !job) {
    console.error("Job assignment lookup failed", { code: jobError?.code, businessId: business.id, jobId });
    redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("The job could not be loaded for assignment.")}`);
  }
  if (technicianIds.length) {
    const { data: selectedTechnicians } = await supabase.from("technician_profiles").select("id,technician_status").eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true).in("id", technicianIds);
    if ((selectedTechnicians?.length ?? 0) !== technicianIds.length) {
      redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("Choose an active technician who can be assigned jobs.")}`);
    }
    if (selectedTechnicians?.some(technician => technician.technician_status === "off_duty")) {
      redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("That technician is currently off duty.")}`);
    }
  }
  const conflicts = job.schedule_commitment==="fixed" ? await Promise.all(technicianIds.map(id => validateJobSchedule({
    supabase, businessId: business.id, timeZone: business.timezone,
    startsAt: job.starts_at ? new Date(job.starts_at) : null,
    endsAt: job.ends_at ? new Date(job.ends_at) : null,
    arrivalWindowStart: job.arrival_window_start ? new Date(job.arrival_window_start) : null,
    arrivalWindowEnd: job.arrival_window_end ? new Date(job.arrival_window_end) : null,
    technicianId: id, excludeJobId: jobId,
  }))) : [];
  const conflict = conflicts.find(Boolean);
  if (conflict) {
    redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent(conflict)}`);
  }
  const { error } = await supabase.rpc("set_job_technicians", {
    p_job_id: jobId,
    p_technician_ids: technicianIds,
  });
  if (error) {
    console.error("Job technician assignment failed", { code: error.code, businessId: business.id, jobId });
    redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("The technician assignment could not be saved.")}`);
  }
  if (technicianId && technicianId !== job.assigned_technician_id) {
    await JobNotificationService.technicianAssigned(jobId);
  }
  revalidatePath(`/app/${slug}/jobs/${jobId}`);
  revalidatePath(`/app/${slug}/jobs`);
  revalidatePath(`/app/${slug}/schedule`);
  revalidatePath(`/app/${slug}/dispatch`);
  redirect(`/app/${slug}/jobs/${jobId}?success=${encodeURIComponent(technicianIds.length ? `${technicianIds.length} technician${technicianIds.length === 1 ? "" : "s"} assigned.` : "Job moved to unassigned.")}`);
}

export async function changeJobStatus(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"job_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/jobs/${jobId}?error=Permission+denied`);
  const status = text(formData, "status");
  if (!jobStatuses.includes(status as typeof jobStatuses[number])) redirect(`/app/${slug}/jobs/${jobId}?error=Invalid+status`);
  const { data: currentJob } = await supabase.from("jobs").select("status").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!currentJob || !canTransitionJob(currentJob.status as JobStatus, status as JobStatus)) {
    redirect(`/app/${slug}/jobs/${jobId}?error=That+status+transition+is+not+allowed`);
  }
  const timestamps: Record<string, string> = {};
  let completionMessage="Status updated";
  const now = new Date().toISOString();
  if (status === "arrived") timestamps.actual_arrival_at = now;
  if (status === "in_progress") timestamps.work_started_at = now;
  if (status === "completed") timestamps.work_completed_at = now;
  const { error } = await supabase.from("jobs").update({ status, ...timestamps, updated_by: user.id }).eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false);
  if (error) redirect(`/app/${slug}/jobs/${jobId}?error=Status+could+not+be+updated`);
  if (status === "confirmed") await JobNotificationService.jobConfirmed(jobId);
  if (status === "en_route") await JobNotificationService.technicianEnRoute(jobId);
  if (status === "completed") {
    await Promise.allSettled([JobNotificationService.jobCompleted(jobId),JobNotificationService.reviewRequest(jobId)]);
    const billing=await processCompletedJobBilling(jobId);
    if(!billing.ok||billing.action==="payment_failed"){
      console.error("Completed job requires billing attention",{businessId:business.id,jobId,reason:billing.error});
      revalidatePath(`/app/${slug}/jobs/${jobId}`);
      redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("The job is complete, but the remaining-balance invoice could not be finalized. Please contact support before closing this order.")}`);
    }
    completionMessage=billing.action==="paid"?"Job completed and the remaining balance was paid.":"Job completed and the remaining-balance invoice was sent.";
  }
  revalidatePath(`/app/${slug}/jobs/${jobId}`); redirect(`/app/${slug}/jobs/${jobId}?success=${encodeURIComponent(completionMessage)}`);
}

export async function overrideBookingDeliveryFee(slug:string,jobId:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"job_management");
 if(!canManageCustomers(role))redirect(`/app/${slug}/jobs/${jobId}?error=Permission+denied`);
 const amount=Number(text(formData,"deliveryFee")),reason=text(formData,"overrideReason");
 if(!Number.isFinite(amount)||amount<0||amount>100000)redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("Enter a valid delivery fee.")}`);
 const [{data:booking},{data:invoice},{data:job}]=await Promise.all([
  supabase.from("bookings").select("id,status,tax_cents,total_cents,balance_due_cents,delivery_fee_cents,delivery_rule_snapshot").eq("business_id",business.id).eq("job_id",jobId).maybeSingle(),
  supabase.from("invoices").select("id,status").eq("business_id",business.id).eq("job_id",jobId).neq("status","void").maybeSingle(),
  supabase.from("jobs").select("subtotal,total_amount").eq("business_id",business.id).eq("id",jobId).maybeSingle(),
 ]);
 if(!booking)redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("This job does not have a delivery-price snapshot.")}`);
 if(invoice&&invoice.status!=="draft")redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("Delivery cannot be changed after the invoice has been finalized.")}`);
 const feeCents=Math.round(amount*100),rule=booking.delivery_rule_snapshot&&typeof booking.delivery_rule_snapshot==="object"?booking.delivery_rule_snapshot as Record<string,unknown>:{},taxRateBasisPoints=Number(rule.taxRateBasisPoints??0),oldTaxCents=Number(booking.tax_cents??0),newTaxCents=Math.round(feeCents*taxRateBasisPoints/10000),difference=feeCents-Number(booking.delivery_fee_cents??0)+newTaxCents-oldTaxCents,now=new Date().toISOString();
 const {error}=await supabase.from("bookings").update({delivery_fee_cents:feeCents,tax_cents:newTaxCents,total_cents:Math.max(0,Number(booking.total_cents)+difference),balance_due_cents:Math.max(0,Number(booking.balance_due_cents)+difference),delivery_fee_override_reason:reason||null,delivery_fee_overridden_by:user.id,delivery_fee_overridden_at:now}).eq("id",booking.id).eq("business_id",business.id);
 if(error)redirect(`/app/${slug}/jobs/${jobId}?error=${encodeURIComponent("Delivery fee could not be updated.")}`);
 if(job)await supabase.from("jobs").update({subtotal:Number(job.subtotal)+difference/100,total_amount:Number(job.total_amount)+difference/100,updated_by:user.id}).eq("id",jobId).eq("business_id",business.id);
 if(invoice?.status==="draft"){await supabase.from("invoices").update({fee_total_cents:feeCents,tax_total_cents:newTaxCents}).eq("id",invoice.id).eq("business_id",business.id);await supabase.from("invoice_fees").delete().eq("business_id",business.id).eq("invoice_id",invoice.id).eq("name_snapshot","Delivery");if(feeCents>0)await supabase.from("invoice_fees").insert({business_id:business.id,invoice_id:invoice.id,name_snapshot:"Delivery",amount_cents:feeCents,sort_order:900});}
 await supabase.from("booking_funnel_events").insert({business_id:business.id,booking_id:booking.id,event_name:"delivery_fee_overridden",metadata:{original_fee_cents:Number(booking.delivery_fee_cents??0),final_fee_cents:feeCents,has_reason:Boolean(reason),actor_user_id:user.id}});
 revalidatePath(`/app/${slug}/jobs/${jobId}`);redirect(`/app/${slug}/jobs/${jobId}?success=${encodeURIComponent("Delivery fee updated.")}`);
}

export async function cancelJob(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"job_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/jobs/${jobId}?error=Permission+denied`);
  const { data: currentJob } = await supabase.from("jobs").select("status").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!currentJob || !canTransitionJob(currentJob.status as JobStatus, "canceled")) {
    redirect(`/app/${slug}/jobs/${jobId}?error=This+job+can+no+longer+be+cancelled`);
  }
  const { error } = await supabase.from("jobs").update({
    status: "canceled", canceled_at: new Date().toISOString(),
    cancellation_reason: text(formData, "cancellationReason") || "Cancelled by office",
    updated_by: user.id,
  }).eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false);
  if (error) redirect(`/app/${slug}/jobs/${jobId}?error=Job+could+not+be+cancelled`);
  await JobNotificationService.jobCancelled(jobId);
  revalidatePath(`/app/${slug}/jobs`); redirect(`/app/${slug}/jobs/${jobId}?success=Job+cancelled`);
}

export async function addJobNote(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"job_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/jobs/${jobId}?error=Permission+denied`);
  const note = text(formData, "note");
  if (!note || note.length > 4000) redirect(`/app/${slug}/jobs/${jobId}?error=Enter+a+note+under+4,000+characters`);
  const noteType = text(formData, "noteType");
  if (!["internal", "customer_visible"].includes(noteType)) redirect(`/app/${slug}/jobs/${jobId}?error=Choose+a+valid+note+type`);
  const { data: job } = await supabase.from("jobs").select("id").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!job) redirect(`/app/${slug}/jobs/${jobId}?error=Job+not+found`);
  const { data: employee } = await supabase.from("employees").select("id,preferred_name").eq("business_id",business.id).eq("auth_user_id",user.id).maybeSingle();
  const { error } = await supabase.from("job_notes").insert({
    business_id: business.id, job_id: jobId, body: note, note_type: noteType,
    author_id: user.id, author_employee_id:employee?.id??null,
    author_name: employee?.preferred_name?.trim() || "Office team",
  });
  if (error) {
    console.error("Job note insert failed", { code: error.code, businessId: business.id, jobId });
    redirect(`/app/${slug}/jobs/${jobId}?error=Note+could+not+be+added`);
  }
  revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(`/app/${slug}/jobs/${jobId}?success=Note+added`);
}

export async function editJobNote(slug: string, jobId: string, formData: FormData) {
  const { supabase, business, role } = await requireWorkspaceCapability(slug,"job_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/jobs/${jobId}?error=Permission+denied`);
  const noteId = text(formData, "noteId");
  const body = text(formData, "body") || text(formData, "note");
  const noteType = text(formData, "noteType");
  if (!body || body.length > 4000 || !["internal", "customer_visible", "technician"].includes(noteType)) redirect(`/app/${slug}/jobs/${jobId}?error=Enter+a+valid+note+under+4,000+characters`);
  const { error } = await supabase.from("job_notes").update({ body, note_type: noteType }).eq("id", noteId).eq("job_id", jobId).eq("business_id", business.id);
  if (error) {
    console.error("Job note edit failed", { code: error.code, businessId: business.id, jobId, noteId });
    redirect(`/app/${slug}/jobs/${jobId}?error=Note+could+not+be+updated`);
  }
  revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(`/app/${slug}/jobs/${jobId}?success=Note+updated`);
}

export async function addJobPhoto(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"job_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/jobs/${jobId}?error=Permission+denied`);
  const { data: job } = await supabase.from("jobs").select("id").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!job) redirect(`/app/${slug}/jobs/${jobId}?error=Job+not+found`);
  const file = formData.get("photo");
  if (!(file instanceof File) || !file.size) redirect(`/app/${slug}/jobs/${jobId}?error=Choose+a+photo`);
  if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "image/heic"].includes(file.type)) {
    redirect(`/app/${slug}/jobs/${jobId}?error=Use+a+JPG,+PNG,+WebP,+or+HEIC+under+10MB`);
  }
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${business.id}/${jobId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("job-photos").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("Job photo upload failed", { code: uploadError.name, businessId: business.id, jobId });
    redirect(`/app/${slug}/jobs/${jobId}?error=Photo+could+not+be+uploaded`);
  }
  const { error } = await supabase.from("job_photos").insert({
    business_id: business.id, job_id: jobId, storage_path: path,
    caption: text(formData, "caption") || null,
    photo_type: ["before", "after", "general"].includes(text(formData, "photoType")) ? text(formData, "photoType") : "general",
    uploaded_by: user.id,
  });
  if (error) {
    await supabase.storage.from("job-photos").remove([path]);
    console.error("Job photo metadata insert failed", { code: error.code, businessId: business.id, jobId });
    redirect(`/app/${slug}/jobs/${jobId}?error=Photo+could+not+be+saved`);
  }
  revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(`/app/${slug}/jobs/${jobId}?success=Photo+added`);
}

export async function removeJobPhoto(slug: string, jobId: string, formData: FormData) {
  const { supabase, business, role } = await requireWorkspaceCapability(slug,"job_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/jobs/${jobId}?error=Permission+denied`);
  const photoId = text(formData, "photoId");
  const { data: photo } = await supabase.from("job_photos").select("id,storage_path").eq("id", photoId).eq("job_id", jobId).eq("business_id", business.id).maybeSingle();
  if (!photo) redirect(`/app/${slug}/jobs/${jobId}?error=Photo+not+found`);
  const { error } = await supabase.from("job_photos").delete().eq("id", photo.id).eq("business_id", business.id);
  if (error) {
    console.error("Job photo removal failed", { code: error.code, businessId: business.id, jobId, photoId });
    redirect(`/app/${slug}/jobs/${jobId}?error=Photo+could+not+be+removed`);
  }
  const { error: storageError } = await supabase.storage.from("job-photos").remove([photo.storage_path]);
  if (storageError) console.warn("Removed job photo object cleanup failed", { code: storageError.name, businessId: business.id, jobId, photoId });
  revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(`/app/${slug}/jobs/${jobId}?success=Photo+removed`);
}

export async function archiveJob(slug: string, jobId: string) {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"job_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/jobs?error=Permission+denied`);
  await supabase.from("jobs").update({ is_deleted: true, updated_by: user.id }).eq("id", jobId).eq("business_id", business.id);
  revalidatePath(`/app/${slug}/jobs`); redirect(`/app/${slug}/jobs?success=Job+archived`);
}
