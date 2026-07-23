"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import { zonedDateTimeToUtc } from "@/lib/bookingTime";
import { validateJobSchedule } from "@/lib/jobScheduling";
import { jobPriorities, jobStatuses, nonNegativeMoney, paymentStatuses, validateJobTimes } from "@/lib/jobValidation";
import { canTransitionJob, type JobStatus } from "@/lib/jobStatusTransitions";
import { requireWorkspace } from "@/lib/workspace";

export type JobActionState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const valuesFrom = (formData: FormData) => Object.fromEntries(
  [...formData.entries()].filter(([, value]) => typeof value === "string"),
) as Record<string, string>;
const localDate = (value: string, timeZone: string) => {
  if (!value) return null;
  const [date, time] = value.split("T");
  if (!date || !time) return null;
  const parsed = zonedDateTimeToUtc(date, time.slice(0, 5), timeZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

async function ownedRecord(
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"],
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
  context: Awaited<ReturnType<typeof requireWorkspace>>,
  excludeJobId?: string,
) {
  const { supabase, business } = context;
  const values = valuesFrom(formData);
  const errors: Record<string, string> = {};
  const title = text(formData, "title");
  const customerId = text(formData, "customerId");
  const locationId = text(formData, "serviceLocationId");
  const serviceId = text(formData, "serviceId");
  const technicianId = text(formData, "technicianId");
  const startsAt = localDate(text(formData, "startsAt"), business.timezone);
  const endsAt = localDate(text(formData, "endsAt"), business.timezone);
  const arrivalStart = localDate(text(formData, "arrivalWindowStart"), business.timezone);
  const arrivalEnd = localDate(text(formData, "arrivalWindowEnd"), business.timezone);
  if (!title) errors.title = "Enter a job title.";
  if (!customerId) errors.customerId = "Choose a customer.";
  const timeError = validateJobTimes(startsAt, endsAt, arrivalStart, arrivalEnd);
  if (timeError) errors.startsAt = timeError;
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
  if (Object.keys(errors).length) return { error: "Please correct the highlighted fields.", errors, values };

  const [customer, location, service, technician] = await Promise.all([
    ownedRecord(supabase, "customers", customerId, business.id),
    ownedRecord(supabase, "service_locations", locationId, business.id),
    ownedRecord(supabase, "services", serviceId, business.id),
    ownedRecord(supabase, "technician_profiles", technicianId, business.id),
  ]);
  if (!customer) errors.customerId = "Customer does not belong to this business.";
  if (locationId && (!location || location.customer_id !== customerId)) errors.serviceLocationId = "Location does not belong to this customer.";
  if (serviceId && !service) errors.serviceId = "Service does not belong to this business.";
  if (technicianId && !technician) errors.technicianId = "Technician is not assignable.";
  if (Object.keys(errors).length) return { error: "One or more selections are invalid.", errors, values };
  const schedulingError = await validateJobSchedule({
    supabase, businessId: business.id, timeZone: business.timezone,
    startsAt, endsAt, technicianId: technicianId || null, excludeJobId,
  });
  if (schedulingError) return { error: schedulingError, errors: { startsAt: schedulingError }, values };
  const estimatedDuration = Number(text(formData, "estimatedDurationMinutes") || 0);
  return {
    values,
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
    },
  };
}

export async function createJob(slug: string, _state: JobActionState, formData: FormData): Promise<JobActionState> {
  const context = await requireWorkspace(slug);
  const { supabase, user, business, role } = context;
  const values = valuesFrom(formData);
  if (!canManageCustomers(role)) return { error: "You do not have permission to create jobs.", values };
  const requestKey = text(formData, "requestKey");
  if (!/^[0-9a-f-]{36}$/i.test(requestKey)) return { error: "Refresh the page before submitting.", values };
  const { data: existing } = await supabase.from("jobs").select("id").eq("business_id", business.id).eq("request_key", requestKey).maybeSingle();
  if (existing) redirect(`/app/${slug}/jobs/${existing.id}`);
  const prepared = await prepareJob(formData, context);
  if (!("payload" in prepared)) return { error: prepared.error, fieldErrors: prepared.errors, values: prepared.values };
  const { data: job, error } = await supabase.from("jobs").insert({
    ...prepared.payload, business_id: business.id, request_key: requestKey,
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
  if (prepared.technicianId) {
    const { error: assignmentError } = await supabase.rpc("set_job_primary_technician", { p_job_id: job.id, p_technician_id: prepared.technicianId });
    if (assignmentError) console.error("Initial job assignment failed", { code: assignmentError.code, businessId: business.id, jobId: job.id });
  }
  revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/jobs`);
  redirect(`/app/${slug}/jobs/${job.id}?success=Job+created`);
}

export async function updateJob(slug: string, jobId: string, _state: JobActionState, formData: FormData): Promise<JobActionState> {
  const context = await requireWorkspace(slug);
  const { supabase, user, business, role } = context;
  const values = valuesFrom(formData);
  if (!canManageCustomers(role)) return { error: "You do not have permission to edit jobs.", values };
  const { data: owned } = await supabase.from("jobs").select("id").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!owned) return { error: "Job not found.", values };
  const prepared = await prepareJob(formData, context, jobId);
  if (!("payload" in prepared)) return { error: prepared.error, fieldErrors: prepared.errors, values: prepared.values };
  const { error } = await supabase.from("jobs").update({ ...prepared.payload, updated_by: user.id }).eq("id", jobId).eq("business_id", business.id);
  if (error) {
    console.error("Office job update failed", { code: error.code, businessId: business.id, jobId });
    return { error: "The job could not be saved.", values };
  }
  const { error: assignmentError } = await supabase.rpc("set_job_primary_technician", { p_job_id: jobId, p_technician_id: prepared.technicianId });
  if (assignmentError) return { error: "Job details saved, but technician assignment could not be updated.", values };
  revalidatePath(`/app/${slug}/jobs`); revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(`/app/${slug}/jobs/${jobId}?success=Job+updated`);
}

export async function changeJobStatus(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(`/app/${slug}/jobs/${jobId}?error=Permission+denied`);
  const status = text(formData, "status");
  if (!jobStatuses.includes(status as typeof jobStatuses[number])) redirect(`/app/${slug}/jobs/${jobId}?error=Invalid+status`);
  const { data: currentJob } = await supabase.from("jobs").select("status").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!currentJob || !canTransitionJob(currentJob.status as JobStatus, status as JobStatus)) {
    redirect(`/app/${slug}/jobs/${jobId}?error=That+status+transition+is+not+allowed`);
  }
  const timestamps: Record<string, string> = {};
  const now = new Date().toISOString();
  if (status === "arrived") timestamps.actual_arrival_at = now;
  if (status === "in_progress") timestamps.work_started_at = now;
  if (status === "completed") timestamps.work_completed_at = now;
  const { error } = await supabase.from("jobs").update({ status, ...timestamps, updated_by: user.id }).eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false);
  if (error) redirect(`/app/${slug}/jobs/${jobId}?error=Status+could+not+be+updated`);
  revalidatePath(`/app/${slug}/jobs/${jobId}`); redirect(`/app/${slug}/jobs/${jobId}?success=Status+updated`);
}

export async function cancelJob(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
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
  revalidatePath(`/app/${slug}/jobs`); redirect(`/app/${slug}/jobs/${jobId}?success=Job+cancelled`);
}

export async function addJobNote(slug: string, jobId: string, formData: FormData) {
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(`/app/${slug}/jobs/${jobId}?error=Permission+denied`);
  const note = text(formData, "note");
  if (!note || note.length > 4000) redirect(`/app/${slug}/jobs/${jobId}?error=Enter+a+note+under+4,000+characters`);
  const noteType = text(formData, "noteType");
  if (!["internal", "customer_visible"].includes(noteType)) redirect(`/app/${slug}/jobs/${jobId}?error=Choose+a+valid+note+type`);
  const { data: job } = await supabase.from("jobs").select("id").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!job) redirect(`/app/${slug}/jobs/${jobId}?error=Job+not+found`);
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const { error } = await supabase.from("job_notes").insert({
    business_id: business.id, job_id: jobId, body: note, note_type: noteType,
    author_id: user.id, author_name: profile?.full_name?.trim() || "Office team",
  });
  if (error) {
    console.error("Job note insert failed", { code: error.code, businessId: business.id, jobId });
    redirect(`/app/${slug}/jobs/${jobId}?error=Note+could+not+be+added`);
  }
  revalidatePath(`/app/${slug}/jobs/${jobId}`);
  redirect(`/app/${slug}/jobs/${jobId}?success=Note+added`);
}

export async function editJobNote(slug: string, jobId: string, formData: FormData) {
  const { supabase, business, role } = await requireWorkspace(slug);
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
  const { supabase, user, business, role } = await requireWorkspace(slug);
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
  const { supabase, business, role } = await requireWorkspace(slug);
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
  const { supabase, user, business, role } = await requireWorkspace(slug);
  if (!canManageCustomers(role)) redirect(`/app/${slug}/jobs?error=Permission+denied`);
  await supabase.from("jobs").update({ is_deleted: true, updated_by: user.id }).eq("id", jobId).eq("business_id", business.id);
  revalidatePath(`/app/${slug}/jobs`); redirect(`/app/${slug}/jobs?success=Job+archived`);
}
