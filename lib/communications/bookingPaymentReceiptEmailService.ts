import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { rentalEmailDeliveryIsLive } from "@/lib/emailDeliveryMode";
import { renderPaymentReceipt } from "./paymentReceipt";

const first = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;

/** Sends a receipt for a paid direct rental booking, which does not use an invoice ledger. */
export async function sendBookingPaymentReceiptEmail(bookingId: string, jobId: string, options: { forceResend?: boolean } = {}) {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, error: "Supabase is unavailable." };
  const { data: booking, error } = await db.from("bookings")
    .select("id,business_id,booking_number,amount_paid_cents,balance_due_cents,paid_at,businesses(name,email),customers(first_name,email)")
    .eq("id", bookingId).maybeSingle();
  if (error || !booking) return { ok: false, error: "Booking details are unavailable." };
  const customer = first(booking.customers), business = first(booking.businesses);
  const amountCents = Number(booking.amount_paid_cents ?? 0);
  if (!customer?.email) return { ok: true, skipped: true, reason: "customer_email_missing" };
  if (amountCents <= 0) return { ok: true, skipped: true, reason: "no_payment_recorded" };

  const eventKey = options.forceResend ? `booking:${booking.id}:resend:${crypto.randomUUID()}` : `booking:${booking.id}`;
  const { data: existing } = options.forceResend ? { data: null } : await db.from("job_communication_events")
    .select("id,status").eq("job_id", jobId).eq("channel", "email").eq("template_key", "payment_receipt").eq("event_key", eventKey).maybeSingle();
  if (existing && ["queued", "sent"].includes(existing.status)) return { ok: true, duplicate: true };

  const receipt = renderPaymentReceipt({
    businessName: business?.name || "Your rental business", customerName: customer.first_name || "there",
    invoiceNumber: `#${booking.booking_number}`, referenceLabel: "Reservation", amountCents,
    balanceCents: Number(booking.balance_due_cents ?? 0), currency: "USD", paidAt: booking.paid_at, method: "card",
  });
  const live = rentalEmailDeliveryIsLive();
  const payload = { job_id: jobId, channel: "email", template_key: "payment_receipt", event_key: eventKey, recipient_email: customer.email, message_body: receipt.text, status: live ? "queued" : "stubbed" };
  const saved = existing ? await db.from("job_communication_events").update(payload).eq("id", existing.id).select("id").single() : await db.from("job_communication_events").insert(payload).select("id").single();
  if (saved.error || !saved.data) return { ok: false, error: "Receipt email could not be recorded." };
  if (!live) return { ok: true, stubbed: true };
  const key = process.env.RESEND_API_KEY?.trim(), configuredFrom = process.env.EMAIL_FROM?.trim();
  if (!key || !configuredFrom) {
    await db.from("job_communication_events").update({ status: "failed", error_message: "Resend is not configured." }).eq("id", saved.data.id);
    return { ok: false, error: "Resend is not configured." };
  }
  const sender = configuredFrom.match(/<([^>]+)>/)?.[1] ?? configuredFrom;
  const businessName = (business?.name || "Your rental business").replace(/[\r\n<>]/g, "").trim();
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `booking-receipt-${saved.data.id}` }, body: JSON.stringify({ from: `${businessName} <${sender}>`, to: [customer.email], ...(business?.email ? { reply_to: business.email } : {}), subject: `Payment receipt — ${businessName} #${booking.booking_number}`, text: receipt.text, html: receipt.html }) });
    const result = await response.json() as { id?: string; message?: string };
    if (!response.ok || !result.id) throw new Error(result.message || `Resend HTTP ${response.status}`);
    await db.from("job_communication_events").update({ status: "sent", provider_message_id: result.id, sent_at: new Date().toISOString(), error_message: null }).eq("id", saved.data.id);
    return { ok: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Receipt email failed.";
    await db.from("job_communication_events").update({ status: "failed", error_message: message.slice(0, 1000) }).eq("id", saved.data.id);
    console.error("Booking receipt email failed", { bookingId, jobId, message });
    return { ok: false, error: message };
  }
}
