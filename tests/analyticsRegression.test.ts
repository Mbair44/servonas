import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("analytics ingestion uses the same public feature gate as browser tracking", async () => {
 const [flags, acquisitionRoute, acquisitionPage, bookingPage] = await Promise.all([
  read("lib/optionalAnalytics.ts"),
  read("app/api/marketing/acquisition/route.ts"),
  read("app/app/admin/marketing/acquisition/page.tsx"),
  read("app/app/[businessSlug]/marketing/funnel/page.tsx"),
 ]);
 assert.match(flags, /return publicOptionalAnalyticsEnabled\(\);/);
 assert.match(flags, /return publicBookingFunnelEnabled\(\);/);
 assert.match(acquisitionRoute, /ANALYTICS_INGESTION_DIAGNOSTICS/);
 assert.match(acquisitionRoute, /logFailure\("session_insert"/);
 assert.match(acquisitionRoute, /logFailure\("event_insert"/);
 assert.match(acquisitionPage, /Global platform scope/);
 assert.match(acquisitionPage, /Analytics diagnostics/);
 assert.match(bookingPage, /Business filter: \{business\.id\}/);
 assert.match(bookingPage, /Events after source filter/);
 assert.match(bookingPage, /Sessions are authoritative visit records even if optional detail-event insertion failed\./);
 assert.match(bookingPage, /buildSourcePerformanceReport\(\[\.\.\.events, \.\.\.sessionVisitRows\]/);
 assert.match(bookingPage, /Query duration:/);
});
