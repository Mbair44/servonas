import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const read = async (relative: string) =>
  readFile(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

test("workspace navigation exposes Meta Ads under marketing", async () => {
  const file = await read("../lib/workspaceNavigation.ts");
  assert.match(file, /{id:"meta-ads",label:"Meta Ads",href:`\$\{base\}\/marketing\/meta-ads`}/);
});

test("meta ads migration creates tenant-scoped connection, performance, sync tables, and vault functions", async () => {
  const migration = await read("../supabase/migrations/20260830000200_meta_ads_integration.sql");
  assert.match(migration, /create table if not exists public\.business_ad_platform_connections/);
  assert.match(migration, /provider text not null check \(provider in \('meta'\)\)/);
  assert.match(migration, /credential_secret_id uuid/);
  assert.match(migration, /status text not null default 'connected_never_synced'/);
  assert.match(migration, /create table if not exists public\.business_ad_platform_daily_performance/);
  assert.match(migration, /unique \(business_id, provider, external_account_id, report_date, campaign_id, adset_id, ad_id\)/);
  assert.match(migration, /spend_amount numeric\(18,6\)/);
  assert.match(migration, /create table if not exists public\.business_ad_platform_sync_events/);
  assert.match(migration, /create or replace function public\.store_ad_platform_access_token/);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /get_ad_platform_access_token/);
  assert.match(migration, /delete_ad_platform_access_token/);
  assert.match(migration, /revoke all on public\.business_ad_platform_connections from anon, authenticated/);
});

test("meta ads service includes oauth, account discovery, token vault storage, action normalization, and sync states", async () => {
  const file = await read("../lib/metaAdsManagement.ts");
  const insightsFields = file.match(/const metaInsightsFields = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.match(file, /const oauthScopes = \["ads_read", "business_management"\]/);
  assert.match(file, /export function metaAdsRedirectUri/);
  assert.match(file, /export function createMetaAdsOauthState/);
  assert.match(file, /export async function completeMetaAdsOauth/);
  assert.match(file, /grant_type: "fb_exchange_token"/);
  assert.match(file, /fb_exchange_token: shortLivedToken\.access_token/);
  assert.match(file, /accessToken: longLivedToken\.access_token/);
  assert.match(file, /expiresInSeconds \* 1000/);
  assert.match(file, /export async function getAccessibleMetaAdAccounts/);
  assert.match(file, /\/me\/adaccounts\?fields=id,account_id,name,account_status,business\{id\}/);
  assert.match(file, /export async function syncMetaAdsPerformance/);
  assert.match(insightsFields, /"spend"/);
  assert.match(insightsFields, /"impressions"/);
  assert.match(insightsFields, /"clicks"/);
  assert.match(insightsFields, /"actions"/);
  assert.doesNotMatch(insightsFields, /campaign_status|adset_status|ad_status/);
  assert.match(file, /time_range: JSON\.stringify\(\{ since, until \}\)/);
  assert.doesNotMatch(file, /time_range\[since\]|time_range\[until\]/);
  assert.match(file, /metricValue\(row\.actions, "landing_page_view"\)/);
  assert.match(file, /metricValue\(row\.actions, "link_click"\)/);
  assert.match(file, /metricValue\(row\.actions, "lead"\)/);
  assert.match(file, /metricValue\(row\.action_values, "purchase"\)/);
  assert.match(file, /status: "syncing"/);
  assert.match(file, /"connected_synced_no_data"/);
  assert.match(file, /"connected_with_data"/);
  assert.match(file, /"authorization_expired"/);
  assert.match(file, /metaErrorCode === 190 && metaErrorSubcode === 463/);
  assert.match(file, /operation === "meta_ads_token_debug" && metaErrorCode === 190/);
  assert.match(file, /"authorization_invalid"/);
  assert.match(file, /"authorization_missing"/);
  assert.match(file, /Please select a Meta ad account before syncing\./);
  assert.match(file, /Meta authorization expired\. Reconnect Meta Ads and try again\./);
  assert.match(file, /metaErrorSubcode/);
  assert.match(file, /metaErrorType/);
  assert.match(file, /graphEndpoint/);
  assert.match(file, /graphHttpStatus/);
  assert.match(file, /provider: "meta"/);
  assert.doesNotMatch(file, /console\.(log|info|error)\([^)]*access_token/i);
  assert.match(file, /\/debug_token\?input_token=/);
  assert.match(file, /tokenAppId: data\.app_id/);
  assert.match(file, /configuredAppId: appId/);
  assert.match(file, /scopes\.includes\("ads_read"\)/);
  assert.match(file, /meta_ads_selected_account_access_check/);
  assert.match(file, /normalizedAdAccountId: accountId/);
  assert.match(file, /"app_mismatch"/);
  assert.match(file, /"inaccessible_account"/);
  assert.match(file, /"token_decryption_failed"/);
});

test("meta ads oauth routes validate state and preserve tenant context", async () => {
  const [connectRoute, callbackRoute] = await Promise.all([
    read("../app/api/meta-ads/connect/[businessSlug]/route.ts"),
    read("../app/api/meta-ads/callback/route.ts"),
  ]);
  assert.match(connectRoute, /store\.set\("servonas_meta_ads_oauth"/);
  assert.match(connectRoute, /createMetaAdsOauthState\(businessSlug, business\.id, user\.id\)/);
  assert.match(callbackRoute, /state !== saved\.state/);
  assert.match(callbackRoute, /saved\.actorUserId && saved\.actorUserId !== user\.id/);
  assert.match(callbackRoute, /isServonasPlatformAdmin\(user\)/);
  assert.match(callbackRoute, /platformAdminAccess \? getSupabaseAdmin\(\) : supabase/);
  assert.match(callbackRoute, /platformAdminAccess\s*\? platformAdminRole/);
  assert.match(callbackRoute, /\.eq\("slug", saved\.businessSlug\)\.eq\("is_deleted", false\)/);
  assert.match(callbackRoute, /getAccessibleMetaAdAccounts/);
  assert.match(callbackRoute, /persistMetaAdsConnection/);
  assert.match(callbackRoute, /Meta Ads authorization could not be verified\./);
});

test("meta ads routes enforce tenant-scoped workspace access for accounts selection disconnect and sync", async () => {
  const [accountsRoute, selectRoute, disconnectRoute, syncRoute] = await Promise.all([
    read("../app/api/meta-ads/accounts/[businessSlug]/route.ts"),
    read("../app/api/meta-ads/select-account/[businessSlug]/route.ts"),
    read("../app/api/meta-ads/disconnect/[businessSlug]/route.ts"),
    read("../app/api/meta-ads/sync/[businessSlug]/route.ts"),
  ]);
  for (const file of [accountsRoute, selectRoute, disconnectRoute, syncRoute]) {
    assert.match(file, /requireWorkspace\(businessSlug\)/);
    assert.match(file, /canManageBusiness\(role\)/);
  }
  assert.match(selectRoute, /That Meta ad account is not available for this tenant\./);
  assert.match(selectRoute, /NextResponse\.redirect\(destination\(businessSlug, kind, message\), 303\)/);
  assert.match(syncRoute, /syncMetaAdsPerformance\(\{ businessId: business\.id, businessSlug: business\.slug, actorUserId: user\.id \}\)/);
  assert.match(syncRoute, /describeMetaAdsSyncFailure\(error\)/);
  assert.match(syncRoute, /failure\.status/);
});

test("marketing spend and funnel reporting aggregate Google plus Meta and remove the old not-connected zero-spend conflation", async () => {
  const [spend, funnel, platform] = await Promise.all([
    read("../lib/marketingSpend.ts"),
    read("../app/app/[businessSlug]/marketing/funnel/page.tsx"),
    read("../lib/adPlatform.ts"),
  ]);
  assert.match(spend, /export class MultiPlatformSpendProvider/);
  assert.match(spend, /loadGoogleAdsSpendForRange/);
  assert.match(spend, /fetchGoogleAdsCampaignMetrics/);
  assert.match(spend, /costMicros/);
  assert.doesNotMatch(spend, /monthly_budget_estimate_cents/);
  assert.match(spend, /\.eq\("provider","meta"\)/);
  assert.match(spend, /facebook:metaSpendCents/);
  assert.match(funnel, /new MultiPlatformSpendProvider\(supabase\)\.getSpendBySource/);
  assert.match(funnel, /const roasCard = buildRoasCardModel/);
  assert.match(funnel, /<strong>\{roasCard\.headline\}<\/strong><small>\{roasCard\.detail\}<\/small>/);
  assert.match(funnel, /Total paid ad spend/);
  assert.match(funnel, /Actual spend for selected dates/);
  assert.match(platform, /"Connect ad spend"/);
  assert.match(platform, /"Ad account connected"/);
  assert.match(platform, /"\$0 ad spend"/);
  assert.match(platform, /"Ad account needs attention"/);
});

test("meta ads workspace and admin pages expose diagnostics without exposing tokens", async () => {
  const [page, admin] = await Promise.all([
    read("../app/app/[businessSlug]/marketing/meta-ads/page.tsx"),
    read("../app/app/admin/marketing/meta-ads/page.tsx"),
  ]);
  assert.match(page, /Meta Ads/);
  assert.match(page, /Sync now/);
  assert.match(page, /Pilot diagnostics/);
  assert.match(page, /stored_in_vault/);
  assert.match(page, /getAccessibleMetaAdAccounts\(\{ businessId: business\.id, businessSlug: business\.slug \}\)/);
  assert.match(page, /<select name="adAccountId" required/);
  assert.match(page, /\{account\.name\} - \{account\.accountId\}/);
  assert.match(page, /disabled=\{!status\.accountId\}/);
  assert.match(await read("../lib/metaAdsManagement.ts"), /\.update\(\{[\s\S]*external_account_id: input\.adAccountId[\s\S]*\.eq\("business_id", input\.businessId\)\.eq\("provider", "meta"\)/);
  assert.match(admin, /Meta Ads pilot/);
  assert.match(admin, /Business rollout view/);
  assert.match(admin, /Recent sync events/);
  assert.doesNotMatch(page, /access_token|refresh_token/i);
});
