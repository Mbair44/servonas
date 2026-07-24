import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { formatBusinessDateTime } from "@/lib/bookingTime";

type EmailTemplate = "booking_confirmation" | "booking_pending" | "booking_cancelled" | "reminder";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]!));

async function queue(jobId: string, template: EmailTemplate) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Supabase is unavailable." };
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("job_number,starts_at,status,service_address,businesses(name,timezone),services(name),customers(first_name,last_name,email)")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError || !job) {
    console.error("Customer booking email lookup failed", { code: jobError?.code, jobId });
    return { ok: false, error: "Job details are unavailable." };
  }
  const business = Array.isArray(job.businesses) ? job.businesses[0] : job.businesses;
  const service = Array.isArray(job.services) ? job.services[0] : job.services;
  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  if (!customer?.email) return { ok: true, skipped: true };

  const existing = await supabase.from("job_communication_events").select("id,status")
    .eq("job_id", jobId).eq("channel", "email").eq("template_key", template).maybeSingle();
  if (existing.data && ["queued", "sent"].includes(existing.data.status)) return { ok: true, duplicate: true };

  const pending = template === "booking_pending";
  const subject = `${pending ? "Booking request received" : "Booking confirmed"} — ${business?.name || "Servonas"}`;
  const appointment = job.starts_at
    ? formatBusinessDateTime(job.starts_at, business?.timezone || "UTC")
    : "To be scheduled";
  const lines = [
    `Hi ${customer.first_name || "there"},`,
    pending ? "We received your appointment request." : "Your appointment is confirmed.",
    `Service: ${service?.name || "Service"}`,
    `When: ${appointment}`,
    job.service_address ? `Where: ${job.service_address}` : null,
    `Confirmation: #${job.job_number}`,
    `Status: ${job.status}`,
  ].filter(Boolean) as string[];
  const text = lines.join("\n\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>`;
  const live = process.env.EMAIL_DELIVERY_MODE === "live";
  const eventPayload = {
    job_id: jobId,
    channel: "email",
    template_key: template,
    status: live ? "queued" : "stubbed",
    recipient_email: customer.email,
    message_body: text,
  };
  const eventResult = existing.data
    ? await supabase.from("job_communication_events").update(eventPayload).eq("id", existing.data.id).select("id").single()
    : await supabase.from("job_communication_events").insert(eventPayload).select("id").single();
  if (eventResult.error || !eventResult.data) {
    console.error("Customer booking email event failed", { code: eventResult.error?.code, jobId });
    return { ok: false, error: eventResult.error?.message || "Email event could not be saved." };
  }
  if (!live) return { ok: true, stubbed: true };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    const message = "Live email mode is enabled, but Resend is not configured.";
    await supabase.from("job_communication_events").update({ status: "failed", error_message: message }).eq("id", eventResult.data.id);
    console.error("Customer booking email delivery failed", { reason: "resend_not_configured", jobId, eventId: eventResult.data.id });
    return { ok: false, error: message };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [customer.email], subject, html, text }),
    });
    const result = await response.json() as { id?: string; name?: string; message?: string; statusCode?: number };
    if (!response.ok || !result.id) {
      const message = result.message || "Resend rejected the email.";
      await supabase.from("job_communication_events").update({ status: "failed", error_message: message }).eq("id", eventResult.data.id);
      console.error("Customer booking email delivery failed", {
        provider: "resend", httpStatus: response.status, providerStatus: result.statusCode,
        providerError: result.name, reason: message, jobId, eventId: eventResult.data.id,
      });
      return { ok: false, error: message };
    }
    await supabase.from("job_communication_events").update({
      status: "sent", provider_message_id: result.id, sent_at: new Date().toISOString(), error_message: null,
    }).eq("id", eventResult.data.id);
    return { ok: true, messageId: result.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email request failed.";
    await supabase.from("job_communication_events").update({ status: "failed", error_message: message }).eq("id", eventResult.data.id);
    console.error("Customer booking email request failed", {
      errorName: error instanceof Error ? error.name : "unknown", errorMessage: message,
      jobId, eventId: eventResult.data.id,
    });
    return { ok: false, error: message };
  }
}

export const EmailService = {
  bookingConfirmation: (jobId: string) => queue(jobId, "booking_confirmation"),
  bookingPending: (jobId: string) => queue(jobId, "booking_pending"),
  bookingCancelled: (jobId: string) => queue(jobId, "booking_cancelled"),
  reminder: (jobId: string) => queue(jobId, "reminder"),
};
