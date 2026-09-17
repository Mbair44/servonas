import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTenantTwilioMessage } from "@/lib/twilio/messageUsage";

type LifecycleType = "reminder" | "technician_en_route" | "review_request" | "payment_receipt";
type First<T> = T | T[] | null;
const first = <T,>(value: First<T>) => Array.isArray(value) ? value[0] ?? null : value;
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "your rental date";

export function rentalLifecycleSmsBody(type: LifecycleType, businessName: string, bookingNumber: number, rentalDate: string | null, payment?: { amountCents: number; balanceDueCents: number }) {
 const prefix = `${businessName}: `;
 if (type === "reminder") return `${prefix}Reminder: your rental booking #${bookingNumber} is tomorrow (${date(rentalDate)}). Questions? Reply here. Reply STOP to opt out.`;
 if (type === "technician_en_route") return `${prefix}Your rental delivery team is on the way for booking #${bookingNumber}. Reply here if you need us. Reply STOP to opt out.`;
 if (type === "review_request") return `${prefix}Thanks for renting with us! How was booking #${bookingNumber}? We’d appreciate your feedback. Reply STOP to opt out.`;
 return `${prefix}Payment received for booking #${bookingNumber}: ${money(payment?.amountCents ?? 0)}.${payment?.balanceDueCents ? ` Remaining balance: ${money(payment.balanceDueCents)}.` : " Your balance is paid."} Reply STOP to opt out.`;
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
 let bookingQuery = db.from("bookings").select("id,business_id,job_id,status,sms_consent,booking_number,customers(phone_normalized,sms_consent_status),businesses(name),booking_items(rental_date)");
 bookingQuery = input.bookingId ? bookingQuery.eq("id", input.bookingId) : bookingQuery.eq("job_id", jobId ?? "");
 const { data: booking, error: bookingError } = await bookingQuery.maybeSingle();
 if (bookingError || !booking || !booking.job_id || !["paid", "confirmed", "completed"].includes(booking.status)) return { ok: true, skipped: true, reason: "rental_booking_not_confirmed" };
 const customer = first(booking.customers), business = first(booking.businesses);
 if (!booking.sms_consent || !customer?.phone_normalized || customer.sms_consent_status !== "express") return { ok: true, skipped: true, reason: "sms_consent_not_current" };
 const { data: phoneConsent, error: consentError } = await db.from("customer_sms_consents").select("status").eq("business_id", booking.business_id).eq("phone_e164", customer.phone_normalized).maybeSingle();
 if (consentError || phoneConsent?.status !== "express") return { ok: true, skipped: true, reason: "sms_consent_not_current" };
 let balanceDueCents = 0;
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
  const body = rentalLifecycleSmsBody(input.type, business?.name ?? "Your rental business", Number(booking.booking_number), rentalDate, payment ? { amountCents: Number(payment.amount_cents), balanceDueCents } : undefined);
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
