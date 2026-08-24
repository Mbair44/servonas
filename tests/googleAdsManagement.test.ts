import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const read = async (relative: string) =>
 readFile(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

test("workspace navigation exposes Google Ads under marketing", async () => {
 const file = await read("../lib/workspaceNavigation.ts");
 assert.match(file, /{id:"google-ads",label:"Google Ads",href:`\$\{base\}\/marketing\/google-ads`}/);
});

test("google ads migration creates private connection and campaign tables", async () => {
 const migration = await read("../supabase/migrations/20260823000100_google_ads_management.sql");
 assert.match(migration, /create table if not exists public\.business_google_ads_connections/);
 assert.match(migration, /create table if not exists public\.business_google_ads_campaigns/);
 assert.match(migration, /create table if not exists public\.business_google_ads_audit_log/);
 assert.match(migration, /revoke all on public\.business_google_ads_connections from anon,authenticated/);
});

test("google ads beta migration creates beta analytics and feedback tables", async () => {
 const migration = await read("../supabase/migrations/20260823000200_google_ads_beta_release.sql");
 assert.match(migration, /create table if not exists public\.business_google_ads_beta_events/);
 assert.match(migration, /create table if not exists public\.business_google_ads_beta_feedback/);
 assert.match(migration, /enable row level security/);
});

test("google ads service includes oauth, publish, metrics, and search-term helpers", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /export const googleAdsRedirectUri/);
 assert.match(file, /export async function completeGoogleAdsOauth/);
 assert.match(file, /export async function publishGoogleAdsCampaign/);
  assert.match(file, /googleAds:searchStream/);
 assert.match(file, /search_term_view\.search_term/);
 assert.match(file, /recordGoogleAdsBetaEvent/);
 assert.match(file, /submitGoogleAdsBetaFeedback/);
});

test("google ads service defaults to a supported api version instead of sunset v20", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /supportedGoogleAdsVersions/);
 assert.match(file, /"v25"/);
 assert.doesNotMatch(file, /process\.env\.GOOGLE_ADS_API_VERSION\?\.trim\(\) \|\| "v20"/);
});

test("google ads workspace uses beta positioning and separates servonas pricing from google spend", async () => {
 const page = await read("../app/app/[businessSlug]/marketing/google-ads/page.tsx");
 assert.match(page, /Google Ads Beta/);
 assert.match(page, /Servonas Ads Beta/);
 assert.match(page, /Google advertising budget/);
 assert.match(page, /Complete Billing with Google/);
 assert.match(page, /Send beta feedback/);
});

test("google ads admin reporting page surfaces beta adoption data", async () => {
 const page = await read("../app/app/admin/marketing/google-ads/page.tsx");
 assert.match(page, /Google Ads beta/);
 assert.match(page, /Business rollout view/);
 assert.match(page, /Recent beta events/);
});
