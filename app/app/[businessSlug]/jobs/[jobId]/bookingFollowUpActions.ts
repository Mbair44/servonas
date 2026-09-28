"use server";
import { randomUUID } from "node:crypto";
import { requireWorkspace } from "@/lib/workspace";
import { canManageCustomers } from "@/lib/access";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createBookingManageToken } from "@/lib/bookingManage/tokens";
import { resolveCurrentSmsConsent } from "@/lib/smsConsent";
import { sendTenantTwilioMessage, TenantSmsError } from "@/lib/twilio/messageUsage";
import { bookingFollowUpBody } from "@/lib/communications/bookingFollowUpBody";
import { revalidatePath } from "next/cache";

const first = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
async function context(slug: string, jobId: string, includeReview: boolean) {
 const { supabase, business, role } = await requireWorkspace(slug);
 if (!canManageCustomers(role)) throw new Error("Not authorized");
 const { data: booking, error } = await supabase.from("bookings").select("id,status,balance_due_cents,customers(first_name,phone_normalized,sms_consent_status)").eq("business_id", business.id).eq("job_id", jobId).maybeSingle();
 if (error || !booking) throw new Error("Booking not found.");
 if (!["confirmed", "paid", "completed"].includes(booking.status)) throw new Error("Balance follow-ups require a confirmed or completed booking. Use the deposit request for bookings awaiting a deposit.");
 const customer = first(booking.customers);
 const { data: consent, error: consentError } = await supabase.from("customer_sms_consents").select("status").eq("business_id", business.id).eq("phone_e164", customer?.phone_normalized ?? "").maybeSingle();
 if (consentError || !resolveCurrentSmsConsent({ phone: customer?.phone_normalized, customerStatus: customer?.sms_consent_status, ledgerStatus: consent?.status }).canSendSms) throw new Error("A valid customer phone number and current explicit SMS consent are required. Check the customer’s text messaging settings.");
 let reviewUrl: string | undefined;
 if (includeReview) {
  const { data: website, error: websiteError } = await supabase.from("business_website_settings").select("google_review_url").eq("business_id", business.id).maybeSingle();
  reviewUrl = website?.google_review_url?.trim();
  if (websiteError || !reviewUrl) throw new Error("Add your Google Business review page link in Settings → Website → Google reviews, or uncheck the review request.");
  try { if (new URL(reviewUrl).protocol !== "https:") throw new Error(); } catch { throw new Error("Update your Google review page link to a valid HTTPS URL in Website settings."); }
 }
 const site = process.env.NEXT_PUBLIC_SITE_URL;
 if (!site || new URL(site).protocol !== "https:") throw new Error("A public HTTPS site URL must be configured before sending booking links.");
 const details = { businessName: business.name, firstName: customer?.first_name ?? "", balanceCents: Math.max(0, Number(booking.balance_due_cents ?? 0)), reviewUrl };
 return { business, booking, phone: customer!.phone_normalized!, site: site.replace(/\/$/, ""), details };
}

export async function previewBookingFollowUp(slug: string, jobId: string, includeReview: boolean) {
 const c = await context(slug, jobId, includeReview);
 return { requestId: randomUUID(), phone: c.phone, body: bookingFollowUpBody({ ...c.details, manageUrl: "[secure manage booking link]" }) };
}

export async function sendBookingFollowUp(slug: string, jobId: string, includeReview: boolean, preview: { requestId: string; phone: string; body: string }) {
 if (!/^[0-9a-f-]{36}$/i.test(preview.requestId)) throw new Error("Preview the text again.");
 const c = await context(slug, jobId, includeReview);
 if (preview.phone !== c.phone || preview.body !== bookingFollowUpBody({ ...c.details, manageUrl: "[secure manage booking link]" })) throw new Error("The booking or recipient has changed. Preview the text again before sending.");
 const db = getSupabaseAdmin();
 if (!db) throw new Error("Messaging is unavailable.");
 const { data: event, error } = await db.from("job_communication_events").insert({ job_id: jobId, channel: "sms", template_key: "payment_request", event_key: `balance-follow-up:${preview.requestId}`, recipient_phone: c.phone, status: "queued" }).select("id").single();
 if (error?.code === "23505") throw new Error("This text was already submitted. Check Communications before creating another text.");
 if (error || !event) throw new Error("The text could not be recorded. Please try again.");
 let sid: string;
 try {
  const token = await createBookingManageToken(c.booking.id, c.business.id);
  const sent = await sendTenantTwilioMessage({ businessId: c.business.id, to: c.phone, body: bookingFollowUpBody({ ...c.details, manageUrl: `${c.site}/manage-booking/${token}` }), sourceType: "rental_payment_request", sourceId: event.id });
  sid = sent.sid;
 } catch (error) {
  if (error instanceof TenantSmsError && error.messageSid) sid = error.messageSid;
  else {
   const message = error instanceof Error ? error.message : "SMS failed.";
   await db.from("job_communication_events").update({ status: "failed", error_message: message.slice(0, 1000) }).eq("id", event.id);
   revalidatePath(`/app/${slug}/jobs/${jobId}`);
   throw new Error(message);
  }
 }
 await db.from("job_communication_events").update({ status: "sent", provider_message_id: sid, sent_at: new Date().toISOString() }).eq("id", event.id);
 revalidatePath(`/app/${slug}/jobs/${jobId}`);
 return { accepted: true };
}
