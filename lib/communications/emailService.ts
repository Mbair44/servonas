import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type EmailTemplate = "booking_confirmation" | "booking_pending" | "booking_cancelled" | "reminder";

async function queue(jobId: string, template: EmailTemplate) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Supabase is unavailable." };
  const { error } = await supabase.from("job_communication_events").insert({
    job_id: jobId,
    channel: "email",
    template_key: template,
    status: "stubbed",
  });
  if (error) console.error("Email stub could not be recorded", error);
  // TODO: Send through Resend or SendGrid after a provider, sender domain,
  // retry policy, and webhook-based delivery tracking are selected.
  return error ? { ok: false, error: error.message } : { ok: true, stubbed: true };
}

export const EmailService = {
  bookingConfirmation: (jobId: string) => queue(jobId, "booking_confirmation"),
  bookingPending: (jobId: string) => queue(jobId, "booking_pending"),
  bookingCancelled: (jobId: string) => queue(jobId, "booking_cancelled"),
  reminder: (jobId: string) => queue(jobId, "reminder"),
};
