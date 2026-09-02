import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAcquisitionLandingPagePath } from "../lib/acquisitionFunnel.ts";
import { acquisitionDateRange, buildAcquisitionReport, classifyAcquisitionSource } from "../lib/acquisitionReporting.ts";

const sessions = [
  {
    id: "session-1",
    industry: "hvac-website",
    first_landing_path: "/hvac-website?gclid=111",
    first_landing_url: "https://servonas.com/hvac-website?gclid=111",
    first_referrer: "",
    first_seen_at: "2026-08-20T10:00:00.000Z",
    gclid: "111",
    gbraid: null,
    wbraid: null,
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "summer",
    utm_term: "hvac",
    utm_content: "headline-a",
  },
  {
    id: "session-2",
    industry: "hvac-website",
    first_landing_path: "/hvac-website?gbraid=222",
    first_landing_url: "https://servonas.com/hvac-website?gbraid=222",
    first_referrer: "",
    first_seen_at: "2026-08-20T11:00:00.000Z",
    gclid: null,
    gbraid: "222",
    wbraid: null,
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "summer",
    utm_term: null,
    utm_content: null,
  },
  {
    id: "session-3",
    industry: "pest-control-website",
    first_landing_path: "/pest-control-website?utm_source=facebook",
    first_landing_url: "https://servonas.com/pest-control-website?utm_source=facebook&utm_campaign=meta",
    first_referrer: "https://facebook.com/",
    first_seen_at: "2026-08-19T11:00:00.000Z",
    gclid: null,
    gbraid: null,
    wbraid: "333",
    utm_source: "facebook",
    utm_medium: "paid_social",
    utm_campaign: "meta",
    utm_term: null,
    utm_content: null,
  },
];

const events = [
  { acquisition_session_id: "session-1", event_name: "website_builder_started" },
  { acquisition_session_id: "session-1", event_name: "website_builder_started" },
  { acquisition_session_id: "session-1", event_name: "website_preview_viewed" },
  { acquisition_session_id: "session-1", event_name: "business_created" },
  { acquisition_session_id: "session-2", event_name: "website_builder_started" },
];

test("normalizes landing pages to pathname only", () => {
  assert.equal(normalizeAcquisitionLandingPagePath("/hvac-website?gclid=123"), "/hvac-website");
  assert.equal(normalizeAcquisitionLandingPagePath("", "https://servonas.com/pest-control-website?utm_source=google"), "/pest-control-website");
});

test("classifies traffic sources without discarding click IDs", () => {
  assert.equal(classifyAcquisitionSource(sessions[0]), "Google Ads");
  assert.equal(classifyAcquisitionSource(sessions[2]), "Google Ads");
  assert.equal(classifyAcquisitionSource({ ...sessions[2], wbraid: null, utm_source: "facebook" }), "Facebook");
  assert.equal(classifyAcquisitionSource({ ...sessions[0], gclid: null, gbraid: null, utm_source: null, utm_medium: null, first_referrer: "" }), "Direct");
});

test("rolls multiple click IDs into one landing page and deduplicates stages per session", () => {
  const report = buildAcquisitionReport(sessions.slice(0, 2), events);
  assert.equal(report.landingPages.length, 1);
  assert.equal(report.landingPages[0].path, "/hvac-website");
  assert.equal(report.landingPages[0].sessions, 2);
  assert.equal(report.landingPages[0].builderStarts, 2);
  assert.equal(report.landingPages[0].previews, 1);
  assert.equal(report.landingPages[0].businesses, 1);
  assert.equal(report.landingPages[0].sessionToBuilderRate, 100);
  assert.equal(report.landingPages[0].builderToPreviewRate, 50);
  assert.equal(report.landingPages[0].previewToBusinessRate, 100);
  assert.equal(report.landingPages[0].sessionToBusinessRate, 50);
  assert.equal(report.landingPages[0].builderDropOff, 1);
});

test("preserves gclid gbraid wbraid and utm values in attribution drill-down", () => {
  const report = buildAcquisitionReport(sessions, events);
  assert.ok(report.attributionRows.some((row) => row.gclid === "111" && row.utmCampaign === "summer"));
  assert.ok(report.attributionRows.some((row) => row.gbraid === "222"));
  assert.ok(report.attributionRows.some((row) => row.wbraid === "333"));
});

test("handles zero denominators safely", () => {
  const report = buildAcquisitionReport([{ ...sessions[0], id: "session-4", first_landing_path: "/landscaping-website", first_landing_url: "https://servonas.com/landscaping-website", gclid: null, gbraid: null, wbraid: null, utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null }], []);
  assert.equal(report.landingPages[0].builderToPreviewRate, 0);
  assert.equal(report.landingPages[0].previewToBusinessRate, 0);
  assert.equal(report.landingPages[0].sessionToBusinessRate, 0);
});

test("includes Servonas home-page signup stages alongside website-builder stages", () => {
 const report = buildAcquisitionReport([{ ...sessions[0], id: "root-session", industry: "servonas.com", first_landing_path: "/", first_landing_url: "https://servonas.com/", gclid: null, gbraid: null, wbraid: null, utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null }], [
  { acquisition_session_id: "root-session", event_name: "marketing_landing_view" },
  { acquisition_session_id: "root-session", event_name: "servonas_signup_started" },
  { acquisition_session_id: "root-session", event_name: "servonas_signup_completed" },
 ]);
 assert.equal(report.landingPages[0].path, "/");
 assert.equal(report.landingPages[0].signupStarts, 1);
 assert.equal(report.landingPages[0].signups, 1);
 assert.equal(report.overall.signupStarts, 1);
 assert.equal(report.overall.signups, 1);
});

test("builds expected date ranges", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");
  assert.deepEqual(acquisitionDateRange("today", undefined, undefined, now, "America/Phoenix"), {
    from: "2026-08-20T07:00:00.000Z",
    to: "2026-08-20T12:00:00.000Z",
  });
  assert.deepEqual(acquisitionDateRange("custom", "2026-08-01", "2026-08-20", now, "America/Phoenix"), {
    from: "2026-08-01T07:00:00.000Z",
    to: "2026-08-21T07:00:00.000Z",
  });
  assert.deepEqual(acquisitionDateRange("last_7_days", "2026-08-10", "2026-08-12", now, "America/Phoenix"), {
    from: "2026-08-10T07:00:00.000Z",
    to: "2026-08-13T07:00:00.000Z",
  });
});

test("includes the Aug 31 to Sep 1 Arizona boundary without assuming UTC midnight", () => {
 assert.deepEqual(acquisitionDateRange("custom", "2026-08-31", "2026-09-01", new Date("2026-09-01T18:00:00.000Z"), "America/Phoenix"), {
  from: "2026-08-31T07:00:00.000Z",
  to: "2026-09-02T07:00:00.000Z",
 });
});
