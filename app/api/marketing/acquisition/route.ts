import { NextResponse } from "next/server";
import { acquisitionEvents, attributionKeys, normalizeAcquisitionLandingPagePath, safeAcquisitionMetadata, validSessionId, type AttributionValues, type AcquisitionEvent } from "@/lib/acquisitionFunnel";
import { optionalAnalyticsEnabled } from "@/lib/optionalAnalytics";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const bots = /bot|crawler|spider|facebookexternalhit|googleother|headless|lighthouse|playwright|puppeteer/i;
const clean = (value: unknown, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const device = (ua: string) => /ipad|tablet/i.test(ua) ? "tablet" : /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop";
const diagnosticsEnabled = () => process.env.ANALYTICS_INGESTION_DIAGNOSTICS === "1";
const logFailure = (stage: string, details: Record<string, unknown>) => { if (diagnosticsEnabled()) console.error("Acquisition analytics ingestion failed", { stage, ...details }); };
const wholeNumber = (value: unknown, max = 3_600_000) => {
  if (value == null || value === "") return null;
  const next = Number(value);
  if (!Number.isFinite(next)) return null;
  return Math.max(0, Math.min(max, Math.round(next)));
};
const textValue = (value: unknown, max = 80) => {
  const next = clean(value, max);
  return next || null;
};
const dedupedEvents = new Set<AcquisitionEvent>(["marketing_landing_view", "page_viewed", "website_builder_started", "website_builder_step1_started", "website_builder_style_viewed", "website_preview_viewed", "pricing_viewed", "demo_started"]);
const sessionMetricUpdate = (metadata: Record<string, string | number | boolean | null>) => {
  const incrementMilliseconds = wholeNumber(metadata.active_duration_increment_milliseconds);
  const source = metadata.timing_event_type === "final_flush" ? "final_flush" : metadata.timing_event_type === "heartbeat" ? "heartbeat" : null;
  return {
    incrementMilliseconds,
    source,
    finalFlushReceived: metadata.timing_is_final === true,
    flushReason: textValue(metadata.timing_flush_reason, 40),
    timingAvailable: metadata.timing_available === true || incrementMilliseconds != null,
    lastActiveAt: textValue(metadata.last_active_at, 80),
  };
};

export async function POST(request: Request) {
  if (!optionalAnalyticsEnabled()) return new NextResponse(null, { status: 204 });
  const purpose = request.headers.get("purpose") || request.headers.get("x-middleware-prefetch") || "";
  const ua = request.headers.get("user-agent") || "";
  if (/prefetch/i.test(purpose) || bots.test(ua)) return new NextResponse(null, { status: 204 });
  const body = await request.json().catch(() => null) as { sessionId?: string; industry?: string; event?: string; path?: string; landingUrl?: string; referrer?: string; attribution?: AttributionValues; metadata?: object; touchSession?: boolean; touchOnly?: boolean } | null;
  if (!body || !validSessionId(body.sessionId) || !body.industry || !acquisitionEvents.has(body.event as never)) return new NextResponse(null, { status: 400 });
  const db = getSupabaseAdmin();
  if (!db) {
    logFailure("admin_client_missing", { event: body.event, industry: body.industry });
    return new NextResponse(null, { status: 204 });
  }
  const now = new Date().toISOString();
  const industry = clean(body.industry, 80);
  const attribution = body.attribution ?? {};
  const metadata = safeAcquisitionMetadata(body.metadata);
  const metricUpdate = sessionMetricUpdate(metadata);
  const sessionPath = normalizeAcquisitionLandingPagePath(clean(body.path), clean(body.landingUrl, 2000));
  const first: Record<string, unknown> = {
    id: body.sessionId,
    industry,
    first_landing_path: sessionPath,
    first_landing_url: clean(body.landingUrl, 2000),
    first_referrer: clean(body.referrer, 2000),
    device_category: device(ua),
    last_seen_at: now,
    updated_at: now,
    active_duration_ms: metricUpdate.incrementMilliseconds ?? null,
    timing_available: metricUpdate.timingAvailable,
    final_flush_received: metricUpdate.finalFlushReceived,
    duration_source: metricUpdate.source,
    duration_last_flush_reason: metricUpdate.flushReason,
    last_active_at: metricUpdate.lastActiveAt,
  };
  for (const key of attributionKeys) first[key] = clean(attribution[key], 500) || null;
  const { data: existing, error: existingError } = await db
    .from("website_acquisition_sessions")
    .select("id,active_duration_ms,timing_available,final_flush_received,duration_source,duration_last_flush_reason,last_active_at")
    .eq("id", body.sessionId)
    .eq("industry", industry)
    .maybeSingle();
  if (existingError) {
    logFailure("session_lookup", { event: body.event, industry, code: existingError.code });
    return new NextResponse(null, { status: 204 });
  }
  const previousMilliseconds = existing ? Math.max(0, Number(existing.active_duration_ms ?? 0)) : 0;
  const nextMilliseconds = metricUpdate.incrementMilliseconds == null ? previousMilliseconds : previousMilliseconds + metricUpdate.incrementMilliseconds;
  const sessionRow = existing ? {
    last_seen_at: now,
    updated_at: now,
    active_duration_ms: metricUpdate.incrementMilliseconds == null ? existing.active_duration_ms : nextMilliseconds,
    timing_available: Boolean(existing.timing_available) || metricUpdate.timingAvailable,
    final_flush_received: Boolean(existing.final_flush_received) || metricUpdate.finalFlushReceived,
    duration_source: metricUpdate.source ?? existing.duration_source ?? null,
    duration_last_flush_reason: metricUpdate.flushReason ?? existing.duration_last_flush_reason ?? null,
    last_active_at: metricUpdate.lastActiveAt ?? existing.last_active_at ?? null,
  } : first;
  const sessionWrite = existing
    ? db.from("website_acquisition_sessions").update(sessionRow).eq("id", body.sessionId).eq("industry", industry)
    : db.from("website_acquisition_sessions").insert(first);
  const inserted = await sessionWrite;
  if (inserted.error) {
    if (existing) logFailure("session_update", { event: body.event, industry, code: inserted.error.code });
    else logFailure("session_insert", { event: body.event, industry, code: inserted.error.code });
    return new NextResponse(null, { status: 204 });
  }
  const event = body.event as AcquisitionEvent;
  if (body.touchOnly || event === "session_heartbeat") return new NextResponse(null, { status: 204 });
  const eventKey = dedupedEvents.has(event) ? `${body.sessionId}:${event}:${sessionPath}` : null;
  const { error: eventError } = await db.from("website_acquisition_events").insert({
    acquisition_session_id: body.sessionId,
    industry,
    event_name: event,
    event_key: eventKey,
    metadata,
  });
  if (eventError && eventError.code !== "23505") logFailure("event_insert", { event, industry, code: eventError.code });
  return new NextResponse(null, { status: 204 });
}
