import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ai insights engine includes deterministic phase 1 setup, google ads, funnel, and crm rules", async () => {
  const source = await read("lib/aiInsights.ts");
  assert.match(source, /type:\s*"setup_incomplete"/);
  assert.match(source, /type:\s*"website_not_published"/);
  assert.match(source, /type:\s*"online_booking_not_enabled"/);
  assert.match(source, /type:\s*"google_ads_under_review"/);
  assert.match(source, /type:\s*"google_ads_campaign_paused"/);
  assert.match(source, /type:\s*"google_ads_clicks_no_conversions"/);
  assert.match(source, /type:\s*"traffic_no_booking_interest"/);
  assert.match(source, /type:\s*"booking_dropoff"/);
  assert.match(source, /type:\s*"lead_followup_needed"/);
  assert.match(source, /type:\s*"invoice_overdue"/);
  assert.match(source, /focus:\s*ranked\.slice\(0,\s*3\)/);
  assert.match(source, /usedLlm:\s*false/);
});

test("ai insights cache stores deterministic snapshots without business email or phone in the cache summary", async () => {
  const source = await read("lib/aiInsights.ts");
  assert.match(source, /export function buildAiInsightsCacheSummary/);
  assert.match(source, /websiteLeads:\s*input\.websiteLeads/);
  assert.match(source, /estimates:\s*input\.estimates/);
  assert.match(source, /invoices:\s*input\.invoices/);
  assert.doesNotMatch(source, /businessEmail:\s*input\.businessEmail/);
  assert.doesNotMatch(source, /businessPhone:\s*input\.businessPhone/);
});

test("marketing funnel page renders the ai insights panel and more-insights section", async () => {
  const [page, styles] = await Promise.all([
    read("app/app/[businessSlug]/marketing/funnel/page.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(page, /<h2>AI Insights<\/h2>/);
  assert.match(page, /Servonas looks across your business and highlights what deserves your attention\./);
  assert.match(page, /Fresh insight snapshot/);
  assert.match(page, /Using cached insight snapshot/);
  assert.match(page, /<summary>More insights<\/summary>/);
  assert.match(page, /Insight diagnostics/);
  assert.match(styles, /\.marketing-ai-panel\{/);
  assert.match(styles, /\.marketing-ai-insight-grid\{/);
  assert.match(styles, /\.marketing-ai-insight-card/);
});

test("ai insights migration creates the snapshot cache table", async () => {
  const migration = await read("supabase/migrations/20260831000100_business_ai_insight_snapshots.sql");
  assert.match(migration, /create table if not exists public\.business_ai_insight_snapshots/i);
  assert.match(migration, /primary key \(business_id,\s*scope\)/i);
  assert.match(migration, /input_hash text not null/i);
  assert.match(migration, /used_llm boolean not null default false/i);
  assert.match(migration, /enable row level security/i);
});
