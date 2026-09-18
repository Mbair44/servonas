import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTenantTwilioMessage } from "@/lib/twilio/messageUsage";

type LifecycleType = "reminder" | "technician_en_route" | "review_request" | "payment_receipt";
type First<T> = T | T[] | null;
const first = <T,>(value: First<T>) => Array.isArray(value) ? value[0] ?? null : value;
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "your rental date";

export function rentalLifecycleSmsBody(type: LifecycleType, businessName: string, rentalItemNames: string[], rentalDate: string | null, payment?: { amountCents: number; balanceDueCents: number; reviewUrl?: string }) {
 const items = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" }).format(rentalItemNames) || "rental";
 const prefix = `${businessName}: `;
 if (type === "reminder") return `${prefix}🎉 Just a reminder that your ${items} rental is coming up on ${date(rentalDate)}. We’re excited to be part of your event! Questions? Just reply here. Reply STOP to opt out.`;
 if (type === "technician_en_route") return `${prefix}🚚 We’re on the way with your ${items}! We’ll see you soon. Questions? Just reply here. Reply STOP to opt out.`;
 if (type === "review_request") return `${prefix}Thanks for choosing us! 🎉 We hope you had a great experience with your ${items}. We’d love your feedback: ${payment?.reviewUrl} Reply STOP to opt out.`;
 return `${prefix}Payment received! We received your ${money(payment?.amountCents ?? 0)} payment for your ${items} rental.${payment?.balanceDueCents ? ` Remaining balance: ${money(payment.balanceDueCents)}.` : " Your rental is paid in full."} Thanks! Reply STOP to opt out.`;
}

export async function sendRentalLifecycleSms(input: { type: LifecycleType; bookingId?: string; jobId?: string; paymentId?: string }) {
 const db = getSupabaseAdmin();
 if (!db) return { ok: false, error: "Supabase is unavailable." };
 let jobId = input.jobId, payment: { id: string; amount_cents: number; invoice_id: string | null } | null = null;
 if (input.paymentId) {
  const { data, error } = await db.from("payments").select("id,job_id,amount_cents,invoice_id,status").eq("id", input.paymentId).eq("status", "succeeded").maybeSingle();
  if (error || !data) return { ok: true, skipped: true, reason: "payment_not_succeeded" };
  payment = data; jobId = jobId ?? data.job_id;
 }
 let bookingQuery = db.from("bookings").select("id,business_id,job_id,status,sms_consent,booking_number,customers(phone_normalized,sms_consent_status),businesses(name),booking_items(rental_date,inventory_items(name))");
 bookingQuery = input.bookingId ? bookingQuery.eq("id", input.bookingId) : bookingQuery.eq("job_id", jobId ?? "");
 const { data: booking, error: bookingError } = await bookingQuery.maybeSingle();
 if (bookingError || !booking || !booking.job_id || !["paid", "confirmed", "completed"].includes(booking.status)) return { ok: true, skipped: true, reason: "rental_booking_not_confirmed" };
 const customer = first(booking.customers), business = first(booking.businesses);
 if (!booking.sms_consent || !customer?.phone_normalized || customer.sms_consent_status !== "express") return { ok: true, skipped: true, reason: "sms_consent_not_current" };
 const { data: phoneConsent, error: consentError } = await db.from("customer_sms_consents").select("status").eq("business_id", booking.business_id).eq("phone_e164", customer.phone_normalized).maybeSingle();
 if (consentError || phoneConsent?.status !== "express") return { ok: true, skipped: true, reason: "sms_consent_not_current" };
 let balanceDueCents = 0, reviewUrl: string | undefined;
 if (input.type === "review_request") {
  const { data: website } = await db.from("business_website_settings").select("google_review_url").eq("business_id", booking.business_id).maybeSingle();
  reviewUrl = website?.google_review_url?.trim() || undefined;
  if (!reviewUrl) return { ok: true, skipped: true, reason: "google_review_url_missing" };
 }
 if (payment?.invoice_id) {
  const { data: invoice } = await db.from("invoices").select("balance_due_cents").eq("id", payment.invoice_id).eq("business_id", booking.business_id).maybeSingle();
  balanceDueCents = Number(invoice?.balance_due_cents ?? 0);
 }
 const eventKey = input.type === "payment_receipt" ? `payment:${payment?.id ?? "missing"}` : `booking:${booking.id}`;
 const event = await db.from("job_communication_events").insert({ job_id: booking.job_id, channel: "sms", template_key: input.type, event_key: eventKey, recipient_phone: customer.phone_normalized, status: "queued" }).select("id").single();
 if (event.error?.code === "23505") return { ok: true, duplicate: true };
 if (event.error || !event.data) return { ok: false, error: "SMS event could not be claimed." };
 try {
  const rentalDate = first(booking.booking_items)?.rental_date ?? null;
  const rentalItemNames = (booking.booking_items ?? []).flatMap(row => { const name = first(row.inventory_items)?.name?.trim(); return name ? [name] : []; });
  const body = rentalLifecycleSmsBody(input.type, business?.name ?? "Your rental business", rentalItemNames, rentalDate, payment ? { amountCents: Number(payment.amount_cents), balanceDueCents, reviewUrl } : input.type === "review_request" ? { amountCents: 0, balanceDueCents: 0, reviewUrl } : undefined);
  const sent = await sendTenantTwilioMessage({ businessId: booking.business_id, to: customer.phone_normalized, body, sourceType: `rental_${input.type}`, sourceId: event.data.id });
  await db.from("job_communication_events").update({ status: "sent", provider_message_id: sent.sid, sent_at: new Date().toISOString(), error_message: null }).eq("id", event.data.id);
  if (input.type === "reminder" || input.type === "review_request") await db.from("bookings").update({ [input.type === "reminder" ? "reminder_sms_sent_at" : "review_sms_sent_at"]: new Date().toISOString() }).eq("id", booking.id);
  return { ok: true, sid: sent.sid };
 } catch (error) {
  const message = error instanceof Error ? error.message : "SMS send failed.";
  await db.from("job_communication_events").update({ status: "failed", error_message: message.slice(0, 1000) }).eq("id", event.data.id);
  console.error("Rental lifecycle SMS failed", { bookingId: booking.id, businessId: booking.business_id, type: input.type });
  return { ok: false, error: message };
 }
}
