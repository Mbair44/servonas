import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type BookingSmsData = {
  id: string;
  booking_number: number;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  deposit_cents: number;
  balance_due_cents: number;
  receipt_token: string;
  stripe_receipt_url: string | null;
  customers: { first_name: string; last_name: string; phone: string } | { first_name: string; last_name: string; phone: string }[] | null;
  booking_items: { rental_date: string; inventory_items: { name: string } | { name: string }[] | null }[] | null;
};

export type SmsTemplateKey = "confirmation" | "reminder" | "review";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function dateText(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function first<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }

export function normalizeUsPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
}

export async function loadBookingSmsData(bookingId: string): Promise<BookingSmsData | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from("bookings")
    .select("id,booking_number,delivery_address,delivery_city,delivery_state,delivery_zip,deposit_cents,balance_due_cents,receipt_token,stripe_receipt_url,customers(first_name,last_name,phone),booking_items(rental_date,inventory_items(name))")
    .eq("id", bookingId).single();
  if (error) { console.error("SMS booking lookup failed", error); return null; }
  return data as BookingSmsData;
}

export function renderSmsTemplate(body: string, booking: BookingSmsData) {
  const customer = first(booking.customers);
  const items = booking.booking_items ?? [];
  const rentalDate = items[0]?.rental_date ?? "";
  const itemNames = items.map((row) => first(row.inventory_items)?.name).filter(Boolean).join(", ");
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const replacements: Record<string, string> = {
    customerName: customer?.first_name || "there",
    bookingNumber: String(booking.booking_number),
    eventDate: rentalDate ? dateText(rentalDate) : "your rental date",
    items: itemNames || "your rental items",
    depositPaid: money(booking.deposit_cents),
    balanceDue: money(booking.balance_due_cents),
    deliveryAddress: `${booking.delivery_address}, ${booking.delivery_city}, ${booking.delivery_state} ${booking.delivery_zip}`,
    receiptLink: `${siteUrl}/receipt/${booking.receipt_token}`,
    stripeReceiptLink: booking.stripe_receipt_url || `${siteUrl}/receipt/${booking.receipt_token}`,
    googleReviewLink: process.env.GOOGLE_REVIEW_URL || "",
  };
  return body.replace(/\{(\w+)\}/g, (_, key: string) => replacements[key] ?? `{${key}}`);
}

export async function sendBookingSms(bookingId: string, templateKey: SmsTemplateKey) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const booking = await loadBookingSmsData(bookingId);
  if (!booking) return { ok: false, error: "Booking was not found." };
  const customer = first(booking.customers);
  if (!customer?.phone) return { ok: false, error: "Customer has no phone number." };
  const { data: template, error: templateError } = await supabase.from("sms_templates").select("body,enabled").eq("template_key", templateKey).single();
  if (templateError || !template) return { ok: false, error: "SMS template was not found." };
  if (!template.enabled) return { ok: true, skipped: true };

  const body = renderSmsTemplate(template.body, booking);
  const phone = normalizeUsPhone(customer.phone);
  const deliveryMode = process.env.SMS_DELIVERY_MODE === "live" ? "live" : "stub";

  // Stub mode is the safe default. It renders and logs the exact message that
  // would be sent, but it never calls an SMS provider or creates a bill.
  if (deliveryMode === "stub") {
    const now = new Date().toISOString();
    const { error: logError } = await supabase.from("sms_messages").insert({
      booking_id: bookingId,
      template_key: templateKey,
      to_phone: phone,
      body,
      status: "skipped",
      error_message: "Stub mode: preview generated; no text message was sent.",
      sent_at: now,
    });
    if (logError) return { ok: false, error: logError.message };

    // Mark the automation as processed so scheduled jobs do not create the same
    // preview every day. These timestamps can be cleared later for test bookings.
    const sentColumn = templateKey === "confirmation" ? "confirmation_sms_sent_at" : templateKey === "reminder" ? "reminder_sms_sent_at" : "review_sms_sent_at";
    await supabase.from("bookings").update({ [sentColumn]: now }).eq("id", bookingId);
    return { ok: true, stubbed: true, preview: body, to: phone };
  }

  const { data: log } = await supabase.from("sms_messages").insert({ booking_id: bookingId, template_key: templateKey, to_phone: phone, body, status: "queued" }).select("id").single();
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !from) {
    if (log?.id) await supabase.from("sms_messages").update({ status: "failed", error_message: "Live SMS mode is enabled, but Twilio environment variables are missing." }).eq("id", log.id);
    return { ok: false, error: "Live SMS mode is enabled, but Twilio is not configured." };
  }
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, From: from, Body: body }),
    });
    const result = await response.json() as { sid?: string; message?: string };
    if (!response.ok) throw new Error(result.message || "Twilio rejected the message.");
    if (log?.id) await supabase.from("sms_messages").update({ status: "sent", twilio_message_sid: result.sid, sent_at: new Date().toISOString() }).eq("id", log.id);
    const sentColumn = templateKey === "confirmation" ? "confirmation_sms_sent_at" : templateKey === "reminder" ? "reminder_sms_sent_at" : "review_sms_sent_at";
    await supabase.from("bookings").update({ [sentColumn]: new Date().toISOString() }).eq("id", bookingId);
    return { ok: true, sid: result.sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMS send failed.";
    if (log?.id) await supabase.from("sms_messages").update({ status: "failed", error_message: message }).eq("id", log.id);
    console.error("SMS send failed", error);
    return { ok: false, error: message };
  }
}
