import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SmsTemplate = "booking_confirmation" | "reminder" | "review_request";

const normalizePhone = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
};

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

async function bookingManagerNotification(jobId: string, phone: string | null | undefined) {
  if (!phone) return { ok: true, skipped: true };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Supabase is unavailable." };

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("job_number,starts_at,service_address,status,businesses(name,timezone),services(name),customers(first_name,last_name)")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError || !job) {
    console.error("Booking manager SMS job lookup failed", { code: jobError?.code, jobId });
    return { ok: false, error: "Job details are unavailable." };
  }

  const business = Array.isArray(job.businesses) ? job.businesses[0] : job.businesses;
  const service = Array.isArray(job.services) ? job.services[0] : job.services;
  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  const timeZone = business?.timezone || "America/Phoenix";
  const appointment = new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(job.starts_at));
  const body = [
    `${business?.name || "Servonas"}: New online booking`,
    `#${job.job_number}`,
    `${customer ? `${customer.first_name} ${customer.last_name}`.trim() : "Customer"}`,
    service?.name || "Service",
    appointment,
    job.service_address || null,
    `Status: ${job.status}`,
  ].filter(Boolean).join(" | ");
  const to = normalizePhone(phone);

  const { data: event, error: eventError } = await supabase
    .from("job_communication_events")
    .insert({
      job_id: jobId,
      channel: "sms",
      template_key: "manager_new_booking",
      status: process.env.SMS_DELIVERY_MODE === "live" ? "queued" : "stubbed",
      recipient_phone: to,
      message_body: body,
    })
    .select("id")
    .single();
  if (eventError) {
    if (eventError.code === "23505") return { ok: true, duplicate: true };
    console.error("Booking manager SMS event could not be recorded", { code: eventError.code, jobId });
    return { ok: false, error: eventError.message };
  }
  if (process.env.SMS_DELIVERY_MODE !== "live") {
    console.info("Booking manager SMS recorded in stub mode", { jobId, eventId: event.id });
    return { ok: true, stubbed: true };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !from) {
    const message = "Live SMS mode is enabled, but Twilio is not configured.";
    await supabase.from("job_communication_events").update({ status: "failed", error_message: message }).eq("id", event.id);
    console.error("Booking manager SMS delivery failed", { reason: "twilio_not_configured", jobId, eventId: event.id });
    return { ok: false, error: message };
  }

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const result = await response.json() as { sid?: string; code?: number; message?: string };
    if (!response.ok || !result.sid) {
      const message = result.message || "Twilio rejected the message.";
      await supabase.from("job_communication_events").update({ status: "failed", error_message: message }).eq("id", event.id);
      console.error("Booking manager SMS delivery failed", {
        provider: "twilio",
        providerCode: result.code,
        httpStatus: response.status,
        reason: message,
        jobId,
        eventId: event.id,
      });
      return { ok: false, error: message };
    }
    await supabase.from("job_communication_events").update({
      status: "sent",
      provider_message_id: result.sid,
      sent_at: new Date().toISOString(),
    }).eq("id", event.id);
    return { ok: true, messageId: result.sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMS request failed.";
    await supabase.from("job_communication_events").update({ status: "failed", error_message: message }).eq("id", event.id);
    console.error("Booking manager SMS request failed", {
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: message,
      jobId,
      eventId: event.id,
    });
    return { ok: false, error: message };
  }
}

export const SMSService = {
  bookingConfirmation: (jobId: string) => queue(jobId, "booking_confirmation"),
  bookingManagerNotification,
  reminder: (jobId: string) => queue(jobId, "reminder"),
  reviewRequest: (jobId: string) => queue(jobId, "review_request"),
};
