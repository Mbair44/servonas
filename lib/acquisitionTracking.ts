import {headers} from "next/headers";
import {attributionFromSearch, validSessionId, type AttributionValues} from "./bookingFunnel.ts";
import {normalizeAcquisitionLandingPagePath, safeAcquisitionMetadata} from "./acquisitionFunnel.ts";
import {getSupabaseAdmin} from "./supabaseAdmin";

const acquisitionCookieName = (industry: string) => `servonas_acquisition_${industry}`;
const botUserAgents = /bot|crawler|spider|facebookexternalhit|googleother|headless|lighthouse|playwright|puppeteer/i;

function diagnosticsEnabled() {
  return process.env.ANALYTICS_INGESTION_DIAGNOSTICS === "1";
}

function clean(value: string | null | undefined, max = 500) {
  const next = value?.trim();
  return next ? next.slice(0, max) : "";
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function referrerHost(value: string) {
  return safeUrl(value)?.hostname.toLowerCase() ?? "";
}

function userAgentCategory(ua: string) {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobile|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

function hasGoogleAdsParams(search: URLSearchParams) {
  return ["gclid", "gbraid", "wbraid", "gad_source", "gad_campaignid"].some((key) => Boolean(clean(search.get(key as never))));
}

function logStage(stage: string, details: Record<string, unknown>) {
  if (diagnosticsEnabled()) console.info(stage, details);
}

function logFailure(stage: string, details: Record<string, unknown>) {
  if (diagnosticsEnabled()) console.error(stage, details);
}

export const marketingAttributionKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "gad_source",
  "gad_campaignid",
] as const;

export async function ensureMarketingAcquisitionSession(input: {
  industry: string;
  path: string;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const headerList = await headers();
  const host = clean(headerList.get("host"), 200);
  const referrer = clean(headerList.get("referer"), 2000);
  const ua = clean(headerList.get("user-agent"), 1000);
  const purpose = clean(headerList.get("purpose") || headerList.get("x-middleware-prefetch"), 100);
  const traceId = crypto.randomUUID();
  const url = new URL(`https://${host || "servonas.com"}${input.path}`);
  const search = url.searchParams;
  for (const [key, value] of Object.entries(input.searchParams ?? {})) {
    const next = Array.isArray(value) ? value[0] : value;
    if (next && !search.has(key)) search.set(key, next);
  }
  const botFiltered = /prefetch/i.test(purpose) || botUserAgents.test(ua);
  const attribution = attributionFromSearch(search) as AttributionValues & {gad_source?: string; gad_campaignid?: string};
  const hasGclid = Boolean(clean(search.get("gclid")));
  const hasGbraid = Boolean(clean(search.get("gbraid")));
  const hasWbraid = Boolean(clean(search.get("wbraid")));
  const utmSource = clean(search.get("utm_source"));
  const utmMedium = clean(search.get("utm_medium"));
  const acquisitionEligible = !botFiltered;
  const landingPath = normalizeAcquisitionLandingPagePath(url.pathname + url.search, url.toString());

  logStage("acquisition_landing_detected", {
    acquisitionTraceId: traceId,
    path: landingPath,
    host,
    hasGclid,
    hasGbraid,
    hasWbraid,
    hasGoogleAdsParams: hasGoogleAdsParams(search),
    utmSource: utmSource || null,
    utmMedium: utmMedium || null,
    referrerHost: referrerHost(referrer) || null,
    userAgentCategory: userAgentCategory(ua),
    botFiltered,
    acquisitionEligible,
  });

  if (!acquisitionEligible) {
    return {sessionId: "", acquisitionTraceId: traceId, botFiltered: true};
  }

  const cookieSessionId = clean(headerList.get("cookie")?.match(new RegExp(`${acquisitionCookieName(input.industry)}=([^;]+)`))?.[1], 80);
  const sessionId = validSessionId(cookieSessionId) ? cookieSessionId : crypto.randomUUID();
  const db = getSupabaseAdmin();
  if (!db) return {sessionId, acquisitionTraceId: traceId, botFiltered: false};

  logStage("acquisition_session_resolution_started", {acquisitionTraceId: traceId, sessionId, path: landingPath});
  logStage("acquisition_session_resolution_completed", {acquisitionTraceId: traceId, sessionId, path: landingPath, reusedSessionId: validSessionId(cookieSessionId)});

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id: sessionId,
    industry: clean(input.industry, 80),
    first_landing_path: landingPath,
    first_landing_url: clean(url.toString(), 2000),
    first_referrer: referrer || null,
    device_category: userAgentCategory(ua),
    last_seen_at: now,
    updated_at: now,
  };
  for (const key of ["gclid", "gbraid", "wbraid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
    row[key] = clean(attribution[key], 500) || null;
  }

  logStage("acquisition_session_persist_started", {acquisitionTraceId: traceId, sessionId, path: landingPath, table: "website_acquisition_sessions"});
  const inserted = await db.from("website_acquisition_sessions").insert(row);
  if (inserted.error && inserted.error.code !== "23505") {
    logFailure("acquisition_session_persist_failed", {
      acquisitionTraceId: traceId,
      path: landingPath,
      table: "website_acquisition_sessions",
      code: inserted.error.code ?? null,
      message: clean(inserted.error.message, 200) || null,
    });
    return {sessionId, acquisitionTraceId: traceId, botFiltered: false};
  }
  if (inserted.error) {
    const {error: updateError} = await db.from("website_acquisition_sessions").update({last_seen_at: now, updated_at: now}).eq("id", sessionId).eq("industry", row.industry);
    if (updateError) {
      logFailure("acquisition_session_persist_failed", {
        acquisitionTraceId: traceId,
        path: landingPath,
        table: "website_acquisition_sessions",
        code: updateError.code ?? null,
        message: clean(updateError.message, 200) || null,
      });
      return {sessionId, acquisitionTraceId: traceId, botFiltered: false};
    }
  }
  logStage("acquisition_session_persist_completed", {acquisitionTraceId: traceId, sessionId, path: landingPath, table: "website_acquisition_sessions"});

  const {error: eventError} = await db.from("website_acquisition_events").insert({
    acquisition_session_id: sessionId,
    industry: row.industry,
    event_name: "marketing_landing_view",
    event_key: `${sessionId}:marketing_landing_view`,
    metadata: safeAcquisitionMetadata({
      acquisition_trace_id: traceId,
      gad_source: clean(search.get("gad_source"), 120) || undefined,
      gad_campaignid: clean(search.get("gad_campaignid"), 120) || undefined,
      has_gclid: hasGclid,
      has_gbraid: hasGbraid,
      has_wbraid: hasWbraid,
      has_google_ads_params: hasGoogleAdsParams(search),
    }),
  });
  if (eventError && eventError.code !== "23505") {
    logFailure("acquisition_session_persist_failed", {
      acquisitionTraceId: traceId,
      path: landingPath,
      table: "website_acquisition_events",
      code: eventError.code ?? null,
      message: clean(eventError.message, 200) || null,
    });
  }
  logStage("acquisition_report_session_eligible", {
    acquisitionTraceId: traceId,
    sessionId,
    path: landingPath,
    hasGclid,
    hasGbraid,
    hasWbraid,
    hasGoogleAdsParams: hasGoogleAdsParams(search),
  });
  return {sessionId, acquisitionTraceId: traceId, botFiltered: false};
}
