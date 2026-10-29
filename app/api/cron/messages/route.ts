import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendRentalLifecycleSms } from "@/lib/communications/rentalLifecycleSms";
import {sendFleetRegistrationReminders} from "@/lib/communications/fleetRegistrationEmailService";

function phoenixDate(offsetDays: number) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const y = Number(parts.find(p => p.type === "year")?.value), m = Number(parts.find(p => p.type === "month")?.value), d = Number(parts.find(p => p.type === "day")?.value);
  const date = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return date.toISOString().slice(0, 10);
}
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin(); if (!supabase) return NextResponse.json({ error: "Supabase unavailable" }, { status: 503 });
  const tomorrow = phoenixDate(1), yesterday = phoenixDate(-1);
  const [reminders, reviews, pendingReviewEvents] = await Promise.all([
    supabase.from("bookings").select("id,booking_items!inner(rental_date)").in("status", ["paid","confirmed"]).is("reminder_sms_sent_at", null).eq("booking_items.rental_date", tomorrow),
    supabase.from("bookings").select("id,booking_items!inner(rental_date)").in("status", ["paid","confirmed","completed"]).is("review_sms_sent_at", null).eq("booking_items.rental_date", yesterday),
    supabase.from("job_communication_events").select("job_id").eq("channel","sms").eq("template_key","review_request").in("status",["queued","failed"]),
  ]);
  const reminderIds = [...new Set((reminders.data ?? []).map((b) => b.id))];
  const pendingJobIds=[...new Set((pendingReviewEvents.data??[]).map(event=>event.job_id))];
  // A review request is a one-day follow-up, not a late-message queue. Retry a
  // transient failure only while the booking is still in its intended window.
  // This also keeps an old queued event from becoming an unexpected text after
  // the automation is enabled or repaired.
  const {data:pendingBookings}=pendingJobIds.length?await supabase.from("bookings").select("id,booking_items!inner(rental_date)").in("job_id",pendingJobIds).in("status",["paid","confirmed","completed"]).is("review_sms_sent_at",null).eq("booking_items.rental_date",yesterday):{data:[]};
  const reviewIds = [...new Set([...(reviews.data ?? []).map((b) => b.id),...(pendingBookings??[]).map(booking=>booking.id)])];
  const [reminderResults,reviewResults,fleetRegistration]=await Promise.all([
    Promise.all(reminderIds.map((bookingId) => sendRentalLifecycleSms({ bookingId, type: "reminder" }))),
    Promise.all(reviewIds.map((bookingId) => sendRentalLifecycleSms({ bookingId, type: "review_request" }))),
    sendFleetRegistrationReminders(),
  ]);
  return NextResponse.json({ tomorrow, yesterday, reminders: reminderResults, reviews: reviewResults,fleetRegistration });
}
