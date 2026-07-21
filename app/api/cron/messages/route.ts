import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendBookingSms } from "@/lib/sms";

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
  const [reminders, reviews] = await Promise.all([
    supabase.from("bookings").select("id,booking_items!inner(rental_date)").in("status", ["paid","confirmed"]).is("reminder_sms_sent_at", null).eq("booking_items.rental_date", tomorrow),
    supabase.from("bookings").select("id,booking_items!inner(rental_date)").in("status", ["paid","confirmed","completed"]).is("review_sms_sent_at", null).eq("booking_items.rental_date", yesterday),
  ]);
  const reminderIds = [...new Set((reminders.data ?? []).map((b) => b.id))];
  const reviewIds = [...new Set((reviews.data ?? []).map((b) => b.id))];
  const reminderResults = await Promise.all(reminderIds.map((id) => sendBookingSms(id, "reminder")));
  const reviewResults = await Promise.all(reviewIds.map((id) => sendBookingSms(id, "review")));
  return NextResponse.json({ tomorrow, yesterday, reminders: reminderResults, reviews: reviewResults });
}
