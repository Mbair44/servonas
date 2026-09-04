import { addDays, dateInTimeZone, zonedDateTimeToUtc } from "./bookingTime.ts";
import { normalizeAcquisitionLandingPagePath, type AcquisitionEvent } from "./acquisitionFunnel.ts";

export const acquisitionReportStages = ["marketing_landing_view", "engaged_session", "interest_shown", "signup_started", "website_builder_started", "website_preview_viewed", "business_created"] as const;
export type AcquisitionReportStage = typeof acquisitionReportStages[number];
export type AcquisitionDurationBucketKey = "under_1_second" | "one_to_four_seconds" | "five_to_nine_seconds" | "ten_to_twenty_nine_seconds" | "thirty_to_fifty_nine_seconds" | "one_to_two_minutes" | "two_or_more_minutes" | "timing_unavailable";

export type AcquisitionSessionRow = {
  id: string;
  visitor_id?: string | null;
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
  last_page_path?: string | null;
  exit_page?: string | null;
  first_meaningful_action?: string | null;
  first_meaningful_action_at?: string | null;
  time_to_first_action_ms?: number | null;
  meaningful_action_count?: number | null;
  device_category?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
};

type EventMetadata = Record<string, unknown> | null | undefined;

export type AcquisitionEventRow = {
  acquisition_session_id: string;
  event_name: AcquisitionEvent | string;
  occurred_at?: string | null;
  metadata?: EventMetadata;
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
  engagedSessions: number;
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
type ReportCount = { key: string; label: string; count: number; percentage: number };
type JourneyRow = {
  sessionId: string;
  visitorType: "new" | "returning" | "unknown";
  source: string;
  landingPage: string;
  pagesVisited: string[];
  exitPage: string | null;
  meaningfulActions: string[];
  firstMeaningfulAction: string | null;
  timeToFirstActionMs: number | null;
  activeDurationMs: number | null;
  conversionOutcome: string;
  device: string;
  startedAt: string | null;
};

const engagementThresholdMs = 10_000;
const meaningfulActionEvents = new Set<string>(["primary_cta_clicked", "secondary_cta_clicked", "pricing_viewed", "pricing_cta_clicked", "plan_selected", "demo_clicked", "demo_started", "demo_completed", "signup_started", "servonas_signup_started", "website_builder_started", "builder_started", "preview_opened"]);
const pricingInterestEvents = new Set<string>(["pricing_viewed", "pricing_cta_clicked", "plan_selected", "demo_clicked", "demo_started", "demo_completed"]);

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function clean(value: string | null | undefined) {
  const next = value?.trim();
  return next ? next : null;
}

function text(metadata: EventMetadata, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function labelEvent(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "None";
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

function isEngaged(session: AcquisitionSessionRow, sessionEvents: Set<string>, pagePaths: Set<string>) {
  return Math.max(0, Number(session.active_duration_ms ?? 0)) >= engagementThresholdMs
    || pagePaths.size >= 2
    || [...sessionEvents].some((event) => meaningfulActionEvents.has(event));
}

function deviceLabel(value: string | null | undefined) {
  if (value === "mobile") return "Mobile";
  if (value === "desktop") return "Desktop";
  if (value === "tablet") return "Tablet";
  return "Other";
}

function pagePathFromEvent(session: AcquisitionSessionRow, event: AcquisitionEventRow) {
  const fromMeta = text(event.metadata, "page_path");
  if (fromMeta) return normalizeAcquisitionLandingPagePath(fromMeta);
  if (event.event_name === "marketing_landing_view" || event.event_name === "page_viewed") return normalizeAcquisitionLandingPagePath(session.first_landing_path, session.first_landing_url);
  return null;
}

function outcomeForSession(sessionEvents: Set<string>) {
  if (sessionEvents.has("business_created")) return "Business created";
  if (sessionEvents.has("servonas_signup_completed") || sessionEvents.has("signup_completed")) return "Signup completed";
  if (sessionEvents.has("website_preview_viewed") || sessionEvents.has("preview_opened")) return "Preview opened";
  if (sessionEvents.has("website_builder_started") || sessionEvents.has("builder_started")) return "Builder started";
  if (sessionEvents.has("servonas_signup_started") || sessionEvents.has("signup_started")) return "Signup started";
  if (sessionEvents.has("pricing_viewed") || sessionEvents.has("demo_clicked")) return "Interest shown";
  return "No conversion";
}

function countByLabel(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
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
  const sortedSessions = sessions.slice().sort((left, right) => String(left.first_seen_at ?? "").localeCompare(String(right.first_seen_at ?? "")));
  const visitorSequence = new Map<string, number>();
  const visitorTypeBySessionId = new Map<string, "new" | "returning" | "unknown">();
  for (const session of sortedSessions) {
    const visitorId = clean(session.visitor_id);
    if (!visitorId) {
      visitorTypeBySessionId.set(session.id, "unknown");
      continue;
    }
    const seen = visitorSequence.get(visitorId) ?? 0;
    visitorTypeBySessionId.set(session.id, seen > 0 ? "returning" : "new");
    visitorSequence.set(visitorId, seen + 1);
  }

  const eventsBySession = new Map<string, AcquisitionEventRow[]>();
  const eventNamesBySession = new Map<string, Set<string>>();
  for (const event of events) {
    const list = eventsBySession.get(event.acquisition_session_id) ?? [];
    list.push(event);
    eventsBySession.set(event.acquisition_session_id, list);
    const names = eventNamesBySession.get(event.acquisition_session_id) ?? new Set<string>();
    names.add(event.event_name);
    eventNamesBySession.set(event.acquisition_session_id, names);
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
    engaged: Set<string>;
  }>();
  const sourceSets = new Map<string, Set<string>>();
  const attributionSets = new Map<string, { row: AttributionRow; sessions: Set<string> }>();
  const behaviorSessions = new Map<string, Set<string>>();
  const deviceSessions = new Map<string, { sessions: Set<string>; reliableDurations: number[]; pricing: Set<string>; demo: Set<string>; signupStarts: Set<string>; businesses: Set<string> }>();
  const sourceBreakdownByPage = new Map<string, string[]>();
  const behaviorLabels = new Map<string, string>([
    ["pricing_viewed", "Viewed pricing"],
    ["pricing_cta_clicked", "Clicked pricing CTA"],
    ["plan_selected", "Selected plan"],
    ["demo_clicked", "Clicked demo"],
    ["primary_cta_clicked", "Clicked primary CTA"],
    ["secondary_cta_clicked", "Clicked secondary CTA"],
    ["signup_started", "Started signup"],
    ["servonas_signup_started", "Started signup"],
    ["website_builder_started", "Started builder"],
    ["builder_started", "Started builder"],
    ["preview_opened", "Opened preview"],
    ["website_preview_viewed", "Opened preview"],
  ]);

  const journeys: JourneyRow[] = [];

  for (const session of sessions) {
    const landingPage = normalizeAcquisitionLandingPagePath(session.first_landing_path, session.first_landing_url);
    const source = classifyAcquisitionSource(session);
    const sessionEvents = eventNamesBySession.get(session.id) ?? new Set<string>();
    const detailedEvents = (eventsBySession.get(session.id) ?? []).slice().sort((left, right) => String(left.occurred_at ?? "").localeCompare(String(right.occurred_at ?? "")));
    const pagePaths = new Set<string>([landingPage]);
    const meaningfulActions: string[] = [];

    for (const event of detailedEvents) {
      const pagePath = pagePathFromEvent(session, event);
      if (pagePath) pagePaths.add(pagePath);
      if (meaningfulActionEvents.has(event.event_name)) meaningfulActions.push(event.event_name);
    }

    const engaged = isEngaged(session, sessionEvents, pagePaths);
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
      engaged: new Set<string>(),
    };
    page.sessions.add(session.id);
    if (reliableTiming(session)) page.reliableDurations.push(Math.max(0, Number(session.active_duration_ms ?? 0)));
    if (sessionEvents.has("website_builder_started") || sessionEvents.has("builder_started")) page.builder.add(session.id);
    if (sessionEvents.has("servonas_signup_started") || sessionEvents.has("signup_started")) page.signupStarts.add(session.id);
    if (sessionEvents.has("servonas_signup_completed") || sessionEvents.has("signup_completed")) page.signups.add(session.id);
    if (sessionEvents.has("website_preview_viewed") || sessionEvents.has("preview_opened")) page.preview.add(session.id);
    if (sessionEvents.has("business_created")) page.business.add(session.id);
    if ([...sessionEvents].some((event) => ["pricing_viewed", "pricing_cta_clicked", "plan_selected"].includes(event))) page.pricing.add(session.id);
    if ([...sessionEvents].some((event) => ["demo_clicked", "demo_started", "demo_completed"].includes(event))) page.demo.add(session.id);
    if (engaged) page.engaged.add(session.id);
    pageSets.set(landingPage, page);

    const sourceBucket = sourceSets.get(source) ?? new Set<string>();
    sourceBucket.add(session.id);
    sourceSets.set(source, sourceBucket);

    const pageSourceList = sourceBreakdownByPage.get(landingPage) ?? [];
    pageSourceList.push(source);
    sourceBreakdownByPage.set(landingPage, pageSourceList);

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

    for (const [eventName, reportLabel] of behaviorLabels) {
      if (!sessionEvents.has(eventName)) continue;
      const set = behaviorSessions.get(reportLabel) ?? new Set<string>();
      set.add(session.id);
      behaviorSessions.set(reportLabel, set);
    }

    const device = deviceLabel(session.device_category);
    const deviceBucket = deviceSessions.get(device) ?? { sessions: new Set<string>(), reliableDurations: [], pricing: new Set<string>(), demo: new Set<string>(), signupStarts: new Set<string>(), businesses: new Set<string>() };
    deviceBucket.sessions.add(session.id);
    if (reliableTiming(session)) deviceBucket.reliableDurations.push(Math.max(0, Number(session.active_duration_ms ?? 0)));
    if ([...sessionEvents].some((event) => ["pricing_viewed", "pricing_cta_clicked", "plan_selected"].includes(event))) deviceBucket.pricing.add(session.id);
    if ([...sessionEvents].some((event) => ["demo_clicked", "demo_started", "demo_completed"].includes(event))) deviceBucket.demo.add(session.id);
    if (sessionEvents.has("servonas_signup_started") || sessionEvents.has("signup_started")) deviceBucket.signupStarts.add(session.id);
    if (sessionEvents.has("business_created")) deviceBucket.businesses.add(session.id);
    deviceSessions.set(device, deviceBucket);

    const firstMeaningfulAction = clean(session.first_meaningful_action) ?? meaningfulActions[0] ?? null;
    const timeToFirstActionMs = session.time_to_first_action_ms != null ? Math.max(0, Number(session.time_to_first_action_ms)) : (() => {
      const firstMeaningfulEvent = detailedEvents.find((event) => meaningfulActionEvents.has(event.event_name));
      if (!firstMeaningfulEvent?.occurred_at || !session.first_seen_at) return null;
      return Math.max(0, new Date(firstMeaningfulEvent.occurred_at).getTime() - new Date(session.first_seen_at).getTime());
    })();

    journeys.push({
      sessionId: session.id,
      visitorType: visitorTypeBySessionId.get(session.id) ?? "unknown",
      source,
      landingPage,
      pagesVisited: [...pagePaths],
      exitPage: reliableTiming(session) ? clean(session.exit_page) ?? clean(session.last_page_path) ?? null : null,
      meaningfulActions: [...new Set(meaningfulActions)].slice(0, 4).map((event) => labelEvent(event)),
      firstMeaningfulAction: firstMeaningfulAction ? labelEvent(firstMeaningfulAction) : null,
      timeToFirstActionMs,
      activeDurationMs: reliableTiming(session) ? Math.max(0, Number(session.active_duration_ms ?? 0)) : null,
      conversionOutcome: outcomeForSession(sessionEvents),
      device,
      startedAt: session.first_seen_at ?? null,
    });
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
    const engagedSessions = value.engaged.size;
    const dropOffs = [
      { stage: "Sessions to Engagement", count: Math.max(0, sessionsCount - engagedSessions) },
      { stage: "Engagement to Interest", count: Math.max(0, engagedSessions - Math.max(pricingViews, demoActions, signupStarts, builderStarts)) },
      { stage: "Interest to Business", count: Math.max(0, Math.max(pricingViews, demoActions, signupStarts, builderStarts) - businesses) },
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
      engagedSessions,
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
  const overallEngaged = sessions.filter((session) => {
    const names = eventNamesBySession.get(session.id) ?? new Set<string>();
    const pages = new Set<string>([normalizeAcquisitionLandingPagePath(session.first_landing_path, session.first_landing_url)]);
    for (const event of eventsBySession.get(session.id) ?? []) {
      const pagePath = pagePathFromEvent(session, event);
      if (pagePath) pages.add(pagePath);
    }
    return isEngaged(session, names, pages);
  }).length;
  const overallInterest = sessions.filter((session) => {
    const names = eventNamesBySession.get(session.id) ?? new Set<string>();
    return [...names].some((event) => pricingInterestEvents.has(event));
  }).length;
  const overallPageViews = new Set(events.filter((event) => event.event_name === "page_viewed" || event.event_name === "marketing_landing_view").map((event) => `${event.acquisition_session_id}:${text(event.metadata, "page_path") ?? ""}`)).size;

  const behaviorBreakdown: ReportCount[] = [...behaviorSessions.entries()]
    .map(([label, sessionIds]) => ({ key: label.toLowerCase().replace(/\s+/g, "_"), label, count: sessionIds.size, percentage: percent(sessionIds.size, sessions.length) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  const deviceBreakdown = [...deviceSessions.entries()]
    .map(([label, value]) => ({ label, sessions: value.sessions.size, avgActiveTimeMs: average(value.reliableDurations), pricingViews: value.pricing.size, demoClicks: value.demo.size, signupStarts: value.signupStarts.size, conversionRate: percent(value.businesses.size, value.sessions.size) }))
    .sort((left, right) => right.sessions - left.sessions || left.label.localeCompare(right.label));

  const visitorBuckets = countByLabel([...visitorTypeBySessionId.values()]);

  return {
    landingPages,
    attributionRows,
    sourceSummary,
    behaviorBreakdown,
    deviceBreakdown,
    visitorBreakdown: [
      { label: "New visitor", count: visitorBuckets.get("new") ?? 0, percentage: percent(visitorBuckets.get("new") ?? 0, sessions.length) },
      { label: "Returning visitor", count: visitorBuckets.get("returning") ?? 0, percentage: percent(visitorBuckets.get("returning") ?? 0, sessions.length) },
      { label: "Unknown visitor", count: visitorBuckets.get("unknown") ?? 0, percentage: percent(visitorBuckets.get("unknown") ?? 0, sessions.length) },
    ],
    sessionJourneys: journeys.sort((left, right) => String(right.startedAt ?? "").localeCompare(String(left.startedAt ?? ""))),
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
      engagedSessions: overallEngaged,
      interestSessions: overallInterest,
      pageViews: overallPageViews,
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
        { stage: "Sessions to Engaged", count: Math.max(0, sessions.length - overallEngaged) },
        { stage: "Engaged to Interest", count: Math.max(0, overallEngaged - overallInterest) },
        { stage: "Interest to Business", count: Math.max(0, overallInterest - overallBusinesses) },
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
