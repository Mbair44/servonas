"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

async function technicianJob(jobId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tech/jobs/${jobId}`)}`);
  const { data: profiles } = await supabase.from("technician_profiles").select("id").eq("member_user_id", user.id).eq("is_active", true).eq("is_technician", true);
  const technicianIds = (profiles ?? []).map((profile) => profile.id);
  if (!technicianIds.length) redirect("/tech?error=Technician+profile+not+found");
  const { data: job } = await supabase.from("jobs").select("id,business_id,assigned_technician_id").eq("id", jobId).in("assigned_technician_id", technicianIds).eq("is_deleted", false).maybeSingle();
  if (!job) redirect("/tech?error=Assigned+job+not+found");
  return { supabase, user, job };
}

export async function transitionTechnicianJob(jobId: string, formData: FormData) {
  const { supabase } = await technicianJob(jobId);
  const status = text(formData, "status");
  const { error } = await supabase.rpc("transition_assigned_job_status", { p_job_id: jobId, p_status: status });
  if (error) {
    console.error("Technician status transition failed", { code: error.code, jobId });
    redirect(`/tech/jobs/${jobId}?error=${encodeURIComponent("That status change is not available.")}`);
  }
  revalidatePath("/tech"); revalidatePath(`/tech/jobs/${jobId}`);
  redirect(`/tech/jobs/${jobId}?success=${encodeURIComponent("Job status updated.")}`);
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
