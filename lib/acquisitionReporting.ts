import { normalizeAcquisitionLandingPagePath, type AcquisitionEvent } from "./acquisitionFunnel.ts";

export const acquisitionReportStages = ["marketing_landing_view","website_builder_started","website_preview_viewed","business_created"] as const;
export type AcquisitionReportStage = typeof acquisitionReportStages[number];

export type AcquisitionSessionRow = {
  id: string;
  industry: string | null;
  first_landing_path: string | null;
  first_landing_url: string | null;
  first_referrer: string | null;
  first_seen_at: string | null;
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
  builderStarts: number;
  previews: number;
  businesses: number;
  sessionToBuilderRate: number;
  builderToPreviewRate: number;
  previewToBusinessRate: number;
  sessionToBusinessRate: number;
  sessionDropOff: number;
  builderDropOff: number;
  previewDropOff: number;
  largestDropOff: { stage: string; count: number } | null;
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

  const pageSets = new Map<string, { sessions: Set<string>; builder: Set<string>; preview: Set<string>; business: Set<string> }>();
  const sourceSets = new Map<string, Set<string>>();
  const attributionSets = new Map<string, { row: AttributionRow; sessions: Set<string> }>();

  for (const session of sessions) {
    const landingPage = normalizeAcquisitionLandingPagePath(session.first_landing_path, session.first_landing_url);
    const source = classifyAcquisitionSource(session);
    const sessionEvents = eventMap.get(session.id) ?? new Set<string>();
    const page = pageSets.get(landingPage) ?? { sessions: new Set<string>(), builder: new Set<string>(), preview: new Set<string>(), business: new Set<string>() };
    page.sessions.add(session.id);
    if (sessionEvents.has("website_builder_started")) page.builder.add(session.id);
    if (sessionEvents.has("website_preview_viewed")) page.preview.add(session.id);
    if (sessionEvents.has("business_created")) page.business.add(session.id);
    pageSets.set(landingPage, page);

    const sourceBucket = sourceSets.get(source) ?? new Set<string>();
    sourceBucket.add(session.id);
    sourceSets.set(source, sourceBucket);

    const attributionKey = [
      landingPage,
      source,
      clean(session.utm_source) ?? "",
      clean(session.utm_medium) ?? "",
      clean(session.utm_campaign) ?? "",
      clean(session.utm_term) ?? "",
      clean(session.utm_content) ?? "",
      clean(session.gclid) ?? "",
      clean(session.gbraid) ?? "",
      clean(session.wbraid) ?? "",
    ].join("|");
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
    const previews = value.preview.size;
    const businesses = value.business.size;
    const sessionDropOff = Math.max(0, sessionsCount - builderStarts);
    const builderDropOff = Math.max(0, builderStarts - previews);
    const previewDropOff = Math.max(0, previews - businesses);
    const dropOffs = [
      { stage: "Sessions → Builder Start", count: sessionDropOff },
      { stage: "Builder Start → Preview", count: builderDropOff },
      { stage: "Preview → Business", count: previewDropOff },
    ];
    return {
      path,
      sessions: sessionsCount,
      builderStarts,
      previews,
      businesses,
      sessionToBuilderRate: percent(builderStarts, sessionsCount),
      builderToPreviewRate: percent(previews, builderStarts),
      previewToBusinessRate: percent(businesses, previews),
      sessionToBusinessRate: percent(businesses, sessionsCount),
      sessionDropOff,
      builderDropOff,
      previewDropOff,
      largestDropOff: dropOffs.sort((left, right) => right.count - left.count)[0] ?? null,
    };
  }).sort((left, right) => right.sessions - left.sessions || left.path.localeCompare(right.path));

  const sourceSummary = [...sourceSets.entries()]
    .map(([source, sessionIds]) => ({ source, sessions: sessionIds.size }))
    .sort((left, right) => right.sessions - left.sessions || left.source.localeCompare(right.source));

  const attributionRows = [...attributionSets.values()]
    .map((entry) => ({ ...entry.row, sessions: entry.sessions.size }))
    .sort((left, right) => right.sessions - left.sessions || left.landingPage.localeCompare(right.landingPage));

  const overallSessions = sessions.length;
  const overallBuilderStarts = new Set(events.filter((event) => event.event_name === "website_builder_started").map((event) => event.acquisition_session_id)).size;
  const overallPreviews = new Set(events.filter((event) => event.event_name === "website_preview_viewed").map((event) => event.acquisition_session_id)).size;
  const overallBusinesses = new Set(events.filter((event) => event.event_name === "business_created").map((event) => event.acquisition_session_id)).size;

  return {
    landingPages,
    attributionRows,
    sourceSummary,
    overall: {
      sessions: overallSessions,
      builderStarts: overallBuilderStarts,
      previews: overallPreviews,
      businesses: overallBusinesses,
      sessionToBuilderRate: percent(overallBuilderStarts, overallSessions),
      builderToPreviewRate: percent(overallPreviews, overallBuilderStarts),
      previewToBusinessRate: percent(overallBusinesses, overallPreviews),
      sessionToBusinessRate: percent(overallBusinesses, overallSessions),
      largestDropOff: [
        { stage: "Sessions → Builder Start", count: Math.max(0, overallSessions - overallBuilderStarts) },
        { stage: "Builder Start → Preview", count: Math.max(0, overallBuilderStarts - overallPreviews) },
        { stage: "Preview → Business", count: Math.max(0, overallPreviews - overallBusinesses) },
      ].sort((left, right) => right.count - left.count)[0] ?? null,
    },
  };
}

export function acquisitionDateRange(range: string | undefined, from: string | undefined, to: string | undefined, now = new Date()) {
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : now.toISOString();
  if (range === "custom" && from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return { from: `${from}T00:00:00.000Z`, to: end };
  }
  const start = new Date(now);
  if (range === "today") {
    start.setUTCHours(0, 0, 0, 0);
  } else if (range === "last_30_days") {
    start.setUTCDate(start.getUTCDate() - 29);
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);
  }
  return { from: start.toISOString(), to: end };
}
