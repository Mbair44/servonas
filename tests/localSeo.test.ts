import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildLocalSeoReport } from "../lib/localSeo.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("builds high-priority service and location recommendations from real business signals", () => {
  const report = buildLocalSeoReport({
    businessName: "Copper State Bounce",
    phone: "+1 480-555-0100",
    websiteBasePath: "https://copperstatebounce.com",
    serviceAreas: ["Gilbert, AZ", "Mesa, AZ"],
    websiteStatus: "published",
    googleBusinessConnected: true,
    googleBusinessLocationTitle: "Copper State Bounce",
    googleBusinessSupportsServices: true,
    services: [
      { id: "svc-1", name: "Water Slide Rentals", bookingCount90d: 18, active: true, price_label: "$299" },
      { id: "svc-2", name: "Bounce House Rentals", bookingCount90d: 2, active: true },
    ],
    locations: [
      { id: "gilbert-az", name: "Gilbert, AZ", jobCount90d: 14, customerCount: 6, reviewCount: 4 },
    ],
    unansweredReviews: [{ reviewId: "rev-1", author: "Sarah M.", rating: 5, text: "The kids loved the water slide!", reply: null, publishedAt: "2026-09-01T00:00:00.000Z" }],
    mappings: [],
    states: [],
    reviewSnippets: [{ author: "Sarah M.", text: "The kids loved the water slide!", locationLabel: "Gilbert, AZ" }],
  });
  assert.ok(report.highPriority.some((item) => item.type === "missing_service_page" && item.entityLabel === "Water Slide Rentals"));
  assert.ok(report.highPriority.some((item) => item.type === "missing_location_page" && item.entityLabel === "Gilbert, AZ"));
  assert.ok(report.recommendations.some((item) => item.type === "unanswered_review"));
  assert.ok(report.recommendations.some((item) => item.type === "missing_google_service"));
});

test("existing mappings suppress duplicate service and location page recommendations", () => {
  const report = buildLocalSeoReport({
    businessName: "Copper State Bounce",
    phone: null,
    websiteBasePath: "https://example.com",
    serviceAreas: [],
    websiteStatus: "published",
    googleBusinessConnected: false,
    googleBusinessLocationTitle: null,
    googleBusinessSupportsServices: false,
    services: [{ id: "svc-1", name: "Water Slide Rentals", bookingCount90d: 18, active: true }],
    locations: [{ id: "gilbert-az", name: "Gilbert, AZ", jobCount90d: 14, customerCount: 6, reviewCount: 4 }],
    unansweredReviews: [],
    mappings: [
      { source_entity_type: "service", source_entity_id: "svc-1", target_type: "website_service_page", status: "draft" },
      { source_entity_type: "location", source_entity_id: "gilbert-az", target_type: "website_location_page", status: "draft" },
    ],
    states: [],
    reviewSnippets: [],
  });
  assert.equal(report.recommendations.some((item) => item.type === "missing_service_page" && item.entityId === "svc-1"), false);
  assert.equal(report.recommendations.some((item) => item.type === "missing_location_page" && item.entityId === "gilbert-az"), false);
});

test("local seo page and navigation expose the new action center", async () => {
  const [page, nav, migration] = await Promise.all([
    read("app/app/[businessSlug]/marketing/seo/page.tsx"),
    read("lib/workspaceNavigation.ts"),
    read("supabase/migrations/20260904000200_local_seo_foundation.sql"),
  ]);
  assert.match(page, /<h1>Local SEO<\/h1>/);
  assert.match(page, /Servonas SEO Score/);
  assert.match(page, /Create page draft/);
  assert.match(page, /notification center/);
  assert.match(nav, /label:"Local SEO",href:`\$\{base\}\/marketing\/seo`/);
  assert.match(migration, /create table if not exists public\.business_local_seo_recommendation_states/);
  assert.match(migration, /create table if not exists public\.business_seo_entity_mappings/);
});
