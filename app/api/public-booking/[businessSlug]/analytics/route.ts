import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const allowedEvents = new Set([
  "page_viewed",
  "calendar_viewed",
  "time_selected",
  "booking_submitted",
  "booking_completed",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessSlug: string }> },
) {
  const { businessSlug } = await params;
  const body = (await request.json().catch(() => null)) as
    | { event?: string; sessionId?: string; serviceId?: string; metadata?: object }
    | null;
  if (!body?.event || !allowedEvents.has(body.event)) {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return new NextResponse(null, { status: 204 });
  const { data: settings } = await supabase
    .from("booking_settings")
    .select("business_id")
    .ilike("public_slug", businessSlug)
    .eq("enabled", true)
    .maybeSingle();
  if (settings) {
    await supabase.from("public_booking_events").insert({
      business_id: settings.business_id,
      event_name: body.event,
      session_id: body.sessionId || null,
      service_id: body.serviceId || null,
      metadata: body.metadata ?? {},
    });
  }
  return new NextResponse(null, { status: 204 });
}
