import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendTenantTwilioMessage } from "@/lib/twilio/messageUsage";
import {createBookingManageToken} from "@/lib/bookingManage/tokens";

const first = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;

export function rentalBookingConfirmationSmsBody(businessName: string, rentalItemNames: string[], rentalDate: string | null, manageBookingUrl?:string|null) {
 const date = rentalDate ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${rentalDate}T12:00:00Z`)) : "your scheduled rental date";
 const names = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" }).format(rentalItemNames);
 return `${businessName}: 🎉 You’re booked! Your ${names ? `${names} rental` : "rental"} is confirmed for ${date}. We’ll text you again as your event gets closer.${manageBookingUrl?` Need to make a change or payment? Manage your booking here: ${manageBookingUrl}`:""} Questions? Just reply here. Reply STOP to opt out.`;
}

export async function sendRentalBookingConfirmationSms(bookingId: string, jobId: string) {
 const db = getSupabaseAdmin();
 if (!db) return { ok: false, error: "Supabase is unavailable." };
 const { data: booking, error: bookingError } = await db.from("bookings")
  .select("business_id,status,sms_consent,businesses(name),customers(phone_normalized,sms_consent_status),booking_items(rental_date,inventory_items(name))")
  .eq("id", bookingId).maybeSingle();
 if (bookingError || !booking) return { ok: false, error: "Booking details are unavailable." };
 if (booking.status !== "confirmed") return { ok: true, skipped: true, reason: "booking_not_confirmed" };
 if (!booking.sms_consent) return { ok: true, skipped: true, reason: "sms_consent_not_granted" };
 const customer = first(booking.customers), business = first(booking.businesses), item = first(booking.booking_items);
 if (!booking.business_id || !customer?.phone_normalized) return { ok: true, skipped: true, reason: "customer_phone_missing" };
 if (customer.sms_consent_status === "opted_out") return { ok: true, skipped: true, reason: "sms_opted_out" };
 const rentalItemNames = (booking.booking_items ?? []).flatMap(row => {
  const name = first(row.inventory_items)?.name?.trim();
  return name ? [name] : [];
 });
 let manageBookingUrl:string|null=null;
 const {data:activeToken}=await db.from("booking_manage_tokens").select("id").eq("booking_id",bookingId).eq("business_id",booking.business_id).is("revoked_at",null).maybeSingle();
 if(!activeToken){try{const token=await createBookingManageToken(bookingId,booking.business_id);manageBookingUrl=`${(process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000").replace(/\/$/,"")}/manage-booking/${token}`;}catch{console.error("Manage booking link generation failed",{bookingId,businessId:booking.business_id});}}
 const body = rentalBookingConfirmationSmsBody(business?.name ?? "Your rental business", rentalItemNames, item?.rental_date ?? null,manageBookingUrl);
 const event = await db.from("job_communication_events").insert({ job_id: jobId, channel: "sms", template_key: "booking_confirmation", status: "queued" }).select("id").single();
 if (event.error?.code === "23505") return { ok: true, duplicate: true };
 if (event.error || !event.data) return { ok: false, error: "SMS event could not be claimed." };
 try {
  const sent = await sendTenantTwilioMessage({ businessId: booking.business_id, to: customer.phone_normalized, body, sourceType: "booking_confirmation", sourceId: event.data.id });
  await db.from("job_communication_events").update({ status: "sent", provider_message_id: sent.sid, sent_at: new Date().toISOString(), error_message: null }).eq("id", event.data.id);
  return { ok: true, sid: sent.sid };
 } catch (error) {
  const message = error instanceof Error ? error.message : "SMS send failed.";
  await db.from("job_communication_events").update({ status: "failed", error_message: message.slice(0, 1000) }).eq("id", event.data.id);
  console.error("Rental booking confirmation SMS failed", { bookingId, businessId: booking.business_id, message });
  return { ok: false, error: message };
 }
}
