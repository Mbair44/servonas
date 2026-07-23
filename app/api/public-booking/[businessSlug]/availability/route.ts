import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAvailability } from "@/lib/publicAvailability";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessSlug: string }> },
) {
  const { businessSlug } = await params;
  const url = new URL(request.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (!serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: "Invalid availability request." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Booking is unavailable." }, { status: 503 });
  const { data: settings } = await supabase
    .from("booking_settings")
    .select("business_id,timezone,minimum_notice_hours,maximum_days_ahead,buffer_minutes,daily_appointment_limit")
    .ilike("public_slug", businessSlug)
    .eq("enabled", true)
    .maybeSingle();
  if (!settings) return NextResponse.json({ error: "Booking page not found." }, { status: 404 });
  const { data: service } = await supabase
    .from("services")
    .select("id,duration_minutes")
    .eq("id", serviceId)
    .eq("business_id", settings.business_id)
    .eq("active", true)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!service) return NextResponse.json({ error: "Service not found." }, { status: 404 });

  const dates = await getAvailability(supabase, settings, service, start, end);
  return NextResponse.json({ dates, timezone: settings.timezone });
}
