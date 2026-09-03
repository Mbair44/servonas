import { addDays, dateInTimeZone, zonedDateTimeToUtc } from "./bookingTime.ts";
import { normalizeAcquisitionLandingPagePath, type AcquisitionEvent } from "./acquisitionFunnel.ts";

export const acquisitionReportStages = ["marketing_landing_view", "website_builder_started", "website_preview_viewed", "business_created"] as const;
export type AcquisitionReportStage = typeof acquisitionReportStages[number];
export type AcquisitionDurationBucketKey = "under_1_second" | "one_to_four_seconds" | "five_to_nine_seconds" | "ten_to_twenty_nine_seconds" | "thirty_to_fifty_nine_seconds" | "one_to_two_minutes" | "two_or_more_minutes" | "timing_unavailable";

export type AcquisitionSessionRow = {
  id: string;
  industry: string | null;
  first_landing_path: string | null;
  first_landing_url: string | null;
  first_referrer: string | null;
  first_seen_at: string | null;
  active_duration_ms?: number | null;
  timing_available?: boolean | null;
  final_flush_received?: boolean | null;
  duration_source?: string | null;
  last_active_at?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
};

export type AcquisitionEventRow = {
  acquisition_session_id: string;
  event_name: AcquisitionEvent | string;
};

type LandingPageStats = {
  path: string;
  sessions: number;
  avgActiveTimeMs: number | null;
  medianActiveTimeMs: number | null;
  signupStarts: number;
  builderStarts: number;
  pricingViews: number;
  demoActions: number;
  signups: number;
  previews: number;
  businesses: number;
  dropOff: { stage: string; count: number } | null;
};

type AttributionRow = {
  landingPage: string;
  source: string;
  sessions: number;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
};

type DurationBucket = { key: AcquisitionDurationBucketKey; label: string; count: number; percentage: number };

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function clean(value: string | null | undefined) {
  const next = value?.trim();
  return next ? next : null;
}

function referrerHost(referrer: string | null | undefined) {
  if (!referrer) return "";
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function reliableTiming(session: AcquisitionSessionRow) {
  return session.timing_available === true && session.active_duration_ms != null && session.final_flush_received === true;
}

function durationBucketFor(session: AcquisitionSessionRow): AcquisitionDurationBucketKey {
  if (!reliableTiming(session)) return "timing_unavailable";
  const duration = Math.max(0, Number(session.active_duration_ms ?? 0));
  if (duration < 1_000) return "under_1_second";
  if (duration < 5_000) return "one_to_four_seconds";
  if (duration < 10_000) return "five_to_nine_seconds";
  if (duration < 30_000) return "ten_to_twenty_nine_seconds";
  if (duration < 60_000) return "thirty_to_fifty_nine_seconds";
  if (duration < 120_000) return "one_to_two_minutes";
  return "two_or_more_minutes";
}

export function classifyAcquisitionSource(session: AcquisitionSessionRow) {
  if (clean(session.gclid) || clean(session.gbraid) || clean(session.wbraid)) return "Google Ads";
  const utmSource = clean(session.utm_source)?.toLowerCase() ?? "";
  const utmMedium = clean(session.utm_medium)?.toLowerCase() ?? "";
  const host = referrerHost(session.first_referrer);
  if (utmSource === "google" && /(cpc|ppc|paid|display|search)/.test(utmMedium)) return "Google Ads";
  if (utmSource && /(facebook|instagram|meta)/.test(utmSource)) return "Facebook";
  if (!utmSource && /(facebook|instagram|meta)\./.test(host)) return "Facebook";
  if (!utmSource && /(google|bing|yahoo)\./.test(host)) return "Organic";
  if (!utmSource && !host) return "Direct";
  return "Other";
}

export function buildAcquisitionReport(sessions: AcquisitionSessionRow[], events: AcquisitionEventRow[]) {
  const eventMap = new Map<string, Set<string>>();
  for (const event of events) {
    const bucket = eventMap.get(event.acquisition_session_id) ?? new Set<string>();
    bucket.add(event.event_name);
    eventMap.set(event.acquisition_session_id, bucket);
  }

  const pageSets = new Map<string, {
    sessions: Set<string>;
    reliableDurations: number[];
    builder: Set<string>;
    signupStarts: Set<string>;
    signups: Set<string>;
    preview: Set<string>;
    business: Set<string>;
    pricing: Set<string>;
    demo: Set<string>;
  }>();
  const sourceSets = new Map<string, Set<string>>();
  const attributionSets = new Map<string, { row: AttributionRow; sessions: Set<string> }>();

  for (const session of sessions) {
    const landingPage = normalizeAcquisitionLandingPagePath(session.first_landing_path, session.first_landing_url);
    const source = classifyAcquisitionSource(session);
    const sessionEvents = eventMap.get(session.id) ?? new Set<string>();
    const page = pageSets.get(landingPage) ?? {
      sessions: new Set<string>(),
      reliableDurations: [],
      builder: new Set<string>(),
      signupStarts: new Set<string>(),
      signups: new Set<string>(),
      preview: new Set<string>(),
      business: new Set<string>(),
      pricing: new Set<string>(),
      demo: new Set<string>(),
    };
    page.sessions.add(session.id);
    if (reliableTiming(session)) page.reliableDurations.push(Math.max(0, Number(session.active_duration_ms ?? 0)));
    if (sessionEvents.has("website_builder_started") || sessionEvents.has("builder_started")) page.builder.add(session.id);
    if (sessionEvents.has("servonas_signup_started") || sessionEvents.has("signup_started")) page.signupStarts.add(session.id);
    if (sessionEvents.has("servonas_signup_completed") || sessionEvents.has("signup_completed")) page.signups.add(session.id);
    if (sessionEvents.has("website_preview_viewed") || sessionEvents.has("preview_opened")) page.preview.add(session.id);
    if (sessionEvents.has("business_created")) page.business.add(session.id);
    if (sessionEvents.has("pricing_viewed")) page.pricing.add(session.id);
    if (sessionEvents.has("demo_clicked") || sessionEvents.has("demo_started")) page.demo.add(session.id);
    pageSets.set(landingPage, page);

    const sourceBucket = sourceSets.get(source) ?? new Set<string>();
    sourceBucket.add(session.id);
    sourceSets.set(source, sourceBucket);

    const attributionKey = [landingPage, source, clean(session.utm_source) ?? "", clean(session.utm_medium) ?? "", clean(session.utm_campaign) ?? "", clean(session.utm_term) ?? "", clean(session.utm_content) ?? "", clean(session.gclid) ?? "", clean(session.gbraid) ?? "", clean(session.wbraid) ?? ""].join("|");
    const attribution = attributionSets.get(attributionKey) ?? {
      row: {
        landingPage,
        source,
        sessions: 0,
        utmSource: clean(session.utm_source),
        utmMedium: clean(session.utm_medium),
        utmCampaign: clean(session.utm_campaign),
        utmTerm: clean(session.utm_term),
        utmContent: clean(session.utm_content),
        gclid: clean(session.gclid),
        gbraid: clean(session.gbraid),
        wbraid: clean(session.wbraid),
      },
      sessions: new Set<string>(),
    };
    attribution.sessions.add(session.id);
    attributionSets.set(attributionKey, attribution);
  }

  const landingPages: LandingPageStats[] = [...pageSets.entries()].map(([path, value]) => {
    const sessionsCount = value.sessions.size;
    const builderStarts = value.builder.size;
    const signupStarts = value.signupStarts.size;
    const signups = value.signups.size;
    const previews = value.preview.size;
    const businesses = value.business.size;
    const pricingViews = value.pricing.size;
    const demoActions = value.demo.size;
    const dropOffs = [
      { stage: "Sessions → Builder Start", count: Math.max(0, sessionsCount - builderStarts) },
      { stage: "Builder Start → Preview", count: Math.max(0, builderStarts - previews) },
      { stage: "Preview → Business", count: Math.max(0, previews - businesses) },
    ];
    return {
      path,
      sessions: sessionsCount,
      avgActiveTimeMs: average(value.reliableDurations),
      medianActiveTimeMs: median(value.reliableDurations),
      signupStarts,
      builderStarts,
      pricingViews,
      demoActions,
      signups,
      previews,
      businesses,
      dropOff: dropOffs.sort((left, right) => right.count - left.count)[0] ?? null,
    };
  }).sort((left, right) => right.sessions - left.sessions || left.path.localeCompare(right.path));

  const sourceSummary = [...sourceSets.entries()]
    .map(([source, sessionIds]) => ({ source, sessions: sessionIds.size }))
    .sort((left, right) => right.sessions - left.sessions || left.source.localeCompare(right.source));

  const attributionRows = [...attributionSets.values()]
    .map((entry) => ({ ...entry.row, sessions: entry.sessions.size }))
    .sort((left, right) => right.sessions - left.sessions || left.landingPage.localeCompare(right.landingPage));

  const reliableDurations = sessions.filter(reliableTiming).map((session) => Math.max(0, Number(session.active_duration_ms ?? 0)));
  const buckets = [
    { key: "under_1_second", label: "Under 1 second", count: 0 },
    { key: "one_to_four_seconds", label: "1-4 seconds", count: 0 },
    { key: "five_to_nine_seconds", label: "5-9 seconds", count: 0 },
    { key: "ten_to_twenty_nine_seconds", label: "10-29 seconds", count: 0 },
    { key: "thirty_to_fifty_nine_seconds", label: "30-59 seconds", count: 0 },
    { key: "one_to_two_minutes", label: "1-2 minutes", count: 0 },
    { key: "two_or_more_minutes", label: "2+ minutes", count: 0 },
    { key: "timing_unavailable", label: "Timing unavailable", count: 0 },
  ] satisfies Array<Omit<DurationBucket, "percentage">>;
  for (const session of sessions) {
    const bucket = buckets.find((entry) => entry.key === durationBucketFor(session));
    if (bucket) bucket.count += 1;
  }

  const overallBuilderStarts = new Set(events.filter((event) => event.event_name === "website_builder_started" || event.event_name === "builder_started").map((event) => event.acquisition_session_id)).size;
  const overallSignupStarts = new Set(events.filter((event) => event.event_name === "servonas_signup_started" || event.event_name === "signup_started").map((event) => event.acquisition_session_id)).size;
  const overallSignups = new Set(events.filter((event) => event.event_name === "servonas_signup_completed" || event.event_name === "signup_completed").map((event) => event.acquisition_session_id)).size;
  const overallPreviews = new Set(events.filter((event) => event.event_name === "website_preview_viewed" || event.event_name === "preview_opened").map((event) => event.acquisition_session_id)).size;
  const overallBusinesses = new Set(events.filter((event) => event.event_name === "business_created").map((event) => event.acquisition_session_id)).size;

  return {
    landingPages,
    attributionRows,
    sourceSummary,
    timeOnSite: {
      buckets: buckets.map((bucket) => ({ ...bucket, percentage: percent(bucket.count, sessions.length) })),
      averageActiveTimeMs: average(reliableDurations),
      medianActiveTimeMs: median(reliableDurations),
      maxActiveTimeMs: reliableDurations.length ? Math.max(...reliableDurations) : null,
      reliableTimingSessions: reliableDurations.length,
      reliableTimingPercentage: percent(reliableDurations.length, sessions.length),
    },
    overall: {
      sessions: sessions.length,
      builderStarts: overallBuilderStarts,
      signupStarts: overallSignupStarts,
      signups: overallSignups,
      previews: overallPreviews,
      businesses: overallBusinesses,
      sessionToBuilderRate: percent(overallBuilderStarts, sessions.length),
      builderToPreviewRate: percent(overallPreviews, overallBuilderStarts),
      previewToBusinessRate: percent(overallBusinesses, overallPreviews),
      sessionToBusinessRate: percent(overallBusinesses, sessions.length),
      largestDropOff: [
        { stage: "Sessions → Builder Start", count: Math.max(0, sessions.length - overallBuilderStarts) },
        { stage: "Builder Start → Preview", count: Math.max(0, overallBuilderStarts - overallPreviews) },
        { stage: "Preview → Business", count: Math.max(0, overallPreviews - overallBusinesses) },
      ].sort((left, right) => right.count - left.count)[0] ?? null,
    },
  };
}

export function acquisitionDateRange(range: string | undefined, from: string | undefined, to: string | undefined, now = new Date(), timeZone = "America/Phoenix") {
  const hasFrom = Boolean(from && /^\d{4}-\d{2}-\d{2}$/.test(from));
  const hasTo = Boolean(to && /^\d{4}-\d{2}-\d{2}$/.test(to));
  const localToday = dateInTimeZone(now, timeZone);
  const effectiveTo = hasTo ? to! : localToday;
  const end = hasTo ? zonedDateTimeToUtc(addDays(effectiveTo, 1), "00:00", timeZone).toISOString() : now.toISOString();
  if (hasFrom || hasTo || range === "custom") {
    const fallbackStartDate = hasTo ? effectiveTo : addDays(localToday, -6);
    return {
      from: zonedDateTimeToUtc(hasFrom ? from! : fallbackStartDate, "00:00", timeZone).toISOString(),
      to: end,
    };
  }
  let startDate = localToday;
  if (range === "today") startDate = localToday;
  else if (range === "last_30_days") startDate = addDays(localToday, -29);
  else startDate = addDays(localToday, -6);
  return {
    from: zonedDateTimeToUtc(startDate, "00:00", timeZone).toISOString(),
    to: end,
  };
}
