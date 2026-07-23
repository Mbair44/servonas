import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SmsTemplate = "booking_confirmation" | "reminder" | "review_request";

async function queue(jobId: string, template: SmsTemplate) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Supabase is unavailable." };
  const { error } = await supabase.from("job_communication_events").insert({
    job_id: jobId,
    channel: "sms",
    template_key: template,
    status: "stubbed",
  });
  if (error) console.error("SMS stub could not be recorded", error);
  // TODO: Connect this adapter to the existing messaging scheduler when a
  // provider is selected. Do not send through Twilio until explicit opt-in,
  // compliance, retry, and delivery-webhook behavior are configured.
  return error ? { ok: false, error: error.message } : { ok: true, stubbed: true };
}

export const SMSService = {
  bookingConfirmation: (jobId: string) => queue(jobId, "booking_confirmation"),
  reminder: (jobId: string) => queue(jobId, "reminder"),
  reviewRequest: (jobId: string) => queue(jobId, "review_request"),
};
