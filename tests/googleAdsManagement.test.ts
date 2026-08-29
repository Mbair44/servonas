import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { mergeGoogleAdsSelectableCustomers } from "../lib/googleAdsAccountDiscovery.ts";

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

test("google ads account hierarchy migration stores login customer and discovered advertiser details", async () => {
 const migration = await read("../supabase/migrations/20260828000200_google_ads_account_hierarchy.sql");
 assert.match(migration, /add column if not exists login_customer_id text/);
 assert.match(migration, /accessible_root_customer_ids text\[]/);
 assert.match(migration, /selectable_customer_details jsonb/);
});

test("google ads discovery cache migration stores retry metadata for quota-limited account lookup", async () => {
 const migration = await read("../supabase/migrations/20260828000400_google_ads_discovery_cache.sql");
 assert.match(migration, /account_discovery_retry_after_at timestamptz/);
 assert.match(migration, /account_discovery_last_http_status integer/);
 assert.match(migration, /account_discovery_last_request_id text/);
});

test("google ads service includes oauth, publish, metrics, and search-term helpers", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /export const googleAdsRedirectUri/);
 assert.match(file, /export async function completeGoogleAdsOauth/);
 assert.match(file, /actorUserId: actorUserId \?\? null/);
 assert.match(file, /customers:listAccessibleCustomers/);
 assert.match(file, /method: "GET"/);
 assert.match(file, /export async function publishGoogleAdsCampaign/);
 assert.match(file, /googleAdsRequestWithLoginFallbacks/);
 assert.match(file, /loginCustomerIds: \[\.\.\.\(input\.loginCustomerIds \?\? \[\]\), input\.customerId, null\]/);
 assert.match(file, /if \(!attempts\.includes\(null\)\) attempts\.push\(null\)/);
 assert.match(file, /googleAds:searchStream/);
 assert.match(file, /customer_client/);
 assert.match(file, /mergeGoogleAdsSelectableCustomers/);
 assert.match(file, /login_customer_id/);
 assert.match(file, /search_term_view\.search_term/);
 assert.match(file, /recordGoogleAdsBetaEvent/);
 assert.match(file, /submitGoogleAdsBetaFeedback/);
});

test("google ads callback authorizes the initiating servonas user and honors owner access", async () => {
 const file = await read("../app/api/google-ads/callback/route.ts");
 assert.match(file, /saved\.actorUserId && saved\.actorUserId !== user\.id/);
 assert.match(file, /business\?\.owner_user_id === user\.id/);
 assert.match(file, /canManageBusiness\(resolvedRole\)/);
 assert.match(file, /platformAdminRole/);
 assert.match(file, /persistGoogleAdsOauthConnection/);
 assert.match(file, /discoverGoogleAdsAccounts/);
 assert.match(file, /Google Ads connected, but Google temporarily limited account lookup/);
});

test("google ads discovery makes child advertisers selectable under an accessible manager", () => {
 const result = mergeGoogleAdsSelectableCustomers(
  [
   { id: "1457771276", label: "Servonas - 145-777-1276", loginCustomerId: null, managerCustomerId: null, isManager: true, level: 0, status: null, source: "direct" },
   { id: "4310256517", label: "Other Root - 431-025-6517", loginCustomerId: null, managerCustomerId: null, isManager: false, level: 0, status: null, source: "direct" },
  ],
  {
   "1457771276": [
    { id: "1742890521", label: "Copper State Bounce - 174-289-0521", loginCustomerId: null, managerCustomerId: null, isManager: false, level: 1, status: "ENABLED", source: "manager_hierarchy" },
    { id: "7946538298", label: "Removed Child - 794-653-8298", loginCustomerId: null, managerCustomerId: null, isManager: false, level: 1, status: "REMOVED", source: "manager_hierarchy" },
   ],
  },
 );
 assert.deepEqual(result.discoveredManagerAccounts.map((customer) => customer.id), ["1457771276"]);
 assert.deepEqual(result.selectableCustomers.map((customer) => [customer.id, customer.loginCustomerId]), [
  ["1742890521", "1457771276"],
  ["4310256517", null],
 ]);
});

test("google ads discovery deduplicates direct and hierarchy children without selecting managers", () => {
 const result = mergeGoogleAdsSelectableCustomers(
  [
   { id: "1457771276", label: "Servonas - 145-777-1276", loginCustomerId: null, managerCustomerId: null, isManager: true, level: 0, status: null, source: "direct" },
   { id: "1742890521", label: "Copper State Bounce - 174-289-0521", loginCustomerId: null, managerCustomerId: null, isManager: false, level: 0, status: null, source: "direct" },
  ],
  {
   "1457771276": [
    { id: "1742890521", label: "Copper State Bounce - 174-289-0521", loginCustomerId: null, managerCustomerId: null, isManager: false, level: 1, status: "ENABLED", source: "manager_hierarchy" },
   ],
  },
 );
 assert.equal(result.selectableCustomers.some((customer) => customer.id === "1457771276"), false);
 assert.deepEqual(result.selectableCustomers.map((customer) => customer.id), ["1742890521"]);
});

test("google ads service defaults to a supported api version instead of sunset v20", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /supportedGoogleAdsVersions/);
 assert.match(file, /"v25"/);
 assert.doesNotMatch(file, /"v23\.1"|"v23\.2"|"v24\.1"|"v24\.2"/);
 assert.doesNotMatch(file, /process\.env\.GOOGLE_ADS_API_VERSION\?\.trim\(\) \|\| "v20"/);
});

test("google ads workspace uses beta positioning and separates servonas pricing from google spend", async () => {
 const [page,submit,actions]=await Promise.all([read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),read("../components/GoogleAdsDraftSubmit.tsx"),read("../app/app/[businessSlug]/marketing/google-ads/actions.ts")]);
 assert.match(page, /Google Ads Beta/);
 assert.match(page, /Servonas Ads Beta/);
 assert.match(page, /Google advertising budget/);
 assert.match(page, /Complete Billing with Google/);
 assert.match(page, /Send beta feedback/);
 assert.match(page, /Use \$\{industryLabel\(business\.industry_profile\)\} business/);
 assert.match(page, /No active services or rentals are available yet/);
 assert.match(page, /GoogleAdsDraftSubmit/);
 assert.match(submit, /Generating campaign draft…/);
 assert.match(submit, /Servonas is building your Google Ads draft/);
 assert.match(actions, /isRedirectError/);
 assert.match(actions, /if \(isRedirectError\(error\)\) throw error;/);
 assert.match(actions, /refreshGoogleAdsAccountsAction/);
 assert.match(page, /Refresh Google Ads accounts/);
 assert.match(page, /account_discovery_retry_after_at/);
});

test("google ads admin reporting page surfaces beta adoption data", async () => {
 const page = await read("../app/app/admin/marketing/google-ads/page.tsx");
 assert.match(page, /Google Ads beta/);
 assert.match(page, /Business rollout view/);
 assert.match(page, /Recent beta events/);
});
