import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendBookingSms, type SmsTemplateKey } from "@/lib/sms";

function authorized(request: Request) { return request.headers.get("x-admin-key") === process.env.ADMIN_ACCESS_KEY; }
export async function PUT(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin(); if (!supabase) return NextResponse.json({ error: "Supabase unavailable" }, { status: 503 });
  const body = await request.json() as { templateKey?: SmsTemplateKey; body?: string; enabled?: boolean };
  if (!body.templateKey || typeof body.body !== "string" || !body.body.trim()) return NextResponse.json({ error: "Template and message are required." }, { status: 400 });
  const { error } = await supabase.from("sms_templates").update({ body: body.body.trim(), enabled: Boolean(body.enabled), updated_at: new Date().toISOString() }).eq("template_key", body.templateKey);
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { bookingId?: string; templateKey?: SmsTemplateKey };
  if (!body.bookingId || !body.templateKey) return NextResponse.json({ error: "Booking and template are required." }, { status: 400 });
  const result = await sendBookingSms(body.bookingId, body.templateKey);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
