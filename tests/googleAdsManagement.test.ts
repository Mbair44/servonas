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
 assert.match(migration, /bidding_strategy text not null default 'MAXIMIZE_CLICKS'/);
 assert.match(migration, /manual_cpc_bid_micros bigint/);
 assert.match(migration, /revoke all on public\.business_google_ads_connections from anon,authenticated/);
});

test("google ads campaign health defaults migration adds bidding columns for existing installs", async () => {
 const migration = await read("../supabase/migrations/20260901000100_google_ads_campaign_health_defaults.sql");
 assert.match(migration, /add column if not exists bidding_strategy text not null default 'MAXIMIZE_CLICKS'/);
 assert.match(migration, /add column if not exists manual_cpc_bid_micros bigint/);
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

test("google ads campaign status sync migration stores live campaign state fields", async () => {
 const migration = await read("../supabase/migrations/20260831000200_google_ads_campaign_status_sync.sql");
 assert.match(migration, /add column if not exists google_campaign_resource_name text/);
 assert.match(migration, /add column if not exists google_campaign_status text/);
 assert.match(migration, /add column if not exists google_campaign_primary_status text/);
 assert.match(migration, /add column if not exists google_campaign_primary_status_reasons jsonb not null default '\[\]'::jsonb/);
});

test("google ads schema sync migration widens connection statuses and backfills missing connection columns", async () => {
 const migration = await read("../supabase/migrations/20260831000100_google_ads_connection_status_schema_sync.sql");
 assert.match(migration, /drop constraint if exists business_google_ads_connections_status_check/);
 assert.match(migration, /'oauth_connected'/);
 assert.match(migration, /'account_discovery_pending'/);
 assert.match(migration, /'account_discovery_rate_limited'/);
 assert.match(migration, /'account_selected'/);
 assert.match(migration, /'account_access_verified'/);
 assert.match(migration, /add column if not exists google_authenticated_email text/);
 assert.match(migration, /add column if not exists selectable_customer_details jsonb not null default '\[\]'::jsonb/);
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
 assert.match(file, /loginCustomerIds: \[\.\.\.\(input\.loginCustomerIds \?\? \[\]\), null\]/);
 assert.match(file, /if \(!attempts\.includes\(null\)\) attempts\.push\(null\)/);
 assert.match(file, /const loginCustomerId = input\.loginCustomerId === undefined \? null : input\.loginCustomerId/);
 assert.match(file, /suppressFailureDiagnostics\?: boolean/);
 assert.match(file, /payloadFingerprint/);
 assert.match(file, /validateOnly: true/);
 assert.match(file, /publishAttempt: 1/);
 assert.match(file, /mutationAttempt: 1/);
 assert.match(file, /biddingStrategyType: campaignCreate\?\.campaignOperation\?\.create\?\.manualCpc \? "MANUAL_CPC"/);
 assert.match(file, /hasManualCpc: Boolean\(campaignCreate\?\.campaignOperation\?\.create\?\.manualCpc\)/);
 assert.match(file, /containsEuPoliticalAdvertising: typeof campaignCreate\?\.campaignOperation\?\.create\?\.containsEuPoliticalAdvertising === "string"/);
 assert.match(file, /export async function fetchGoogleAdsCampaignStatuses/);
 assert.match(file, /googleAds:searchStream/);
 assert.match(file, /campaign\.resource_name/);
 assert.match(file, /campaign\.primary_status/);
 assert.match(file, /campaign\.primary_status_reasons/);
 assert.match(file, /readGoogleAdsField/);
 assert.match(file, /extractGoogleAdsErrorPayload/);
 assert.match(file, /const normalizeGoogleAdsDate = \(value: string\)/);
 assert.match(file, /const googleAdsCustomDateRangeFilter = \(dateFrom: string, dateTo: string\)/);
 assert.match(file, /segments\.date BETWEEN/);
 assert.match(file, /requestType: context\.requestType/);
 assert.match(file, /businessId: context\.businessId \?\? null/);
 assert.match(file, /gaql: query/);
 assert.match(file, /Google Ads campaign status query started/);
 assert.match(file, /Google Ads campaign status query completed/);
 assert.match(file, /Google Ads campaign status query failed/);
 assert.match(file, /Google Ads campaign status query falling back/);
 assert.match(file, /Google Ads campaign status fallback failed/);
 assert.match(file, /queryResultCount: snapshots\.length/);
 assert.match(file, /googleCampaignStatus: snapshot\.status/);
 assert.match(file, /servingStatus: snapshot\.primaryStatus/);
 assert.match(file, /issuesAvailable: snapshot\.issuesAvailable/);
 assert.match(file, /syncFailureReason:/);
 assert.match(file, /customer_client/);
 assert.match(file, /mergeGoogleAdsSelectableCustomers/);
 assert.match(file, /login_customer_id/);
 assert.match(file, /search_term_view\.search_term/);
 assert.doesNotMatch(file, /CUSTOM_DATE_RANGE/);
 assert.match(file, /recordGoogleAdsBetaEvent/);
 assert.match(file, /submitGoogleAdsBetaFeedback/);
 assert.match(file, /const googleAdsOauthScopes = \["https:\/\/www\.googleapis\.com\/auth\/adwords", "openid", "email", "profile"\]/);
 assert.match(file, /url\.searchParams\.set\("scope", googleAdsOauthScopes\.join\(" "\)\)/);
 assert.match(file, /id_token\?: string/);
 assert.match(file, /identitySource: "id_token"/);
 assert.match(file, /identitySource: "userinfo"/);
 assert.match(file, /resourceNames: list\.resourceNames \?\? \[\]/);
 assert.match(file, /const authenticatedIdentity = await fetchGoogleAdsAuthenticatedIdentity\(token\.access_token!, token\.id_token \?\? null, context\)/);
 assert.match(file, /Direct advertiser access checks passed/);
 assert.match(file, /"oauth_connected"/);
 assert.match(file, /"account_discovery_pending"/);
 assert.match(file, /"account_discovery_rate_limited"/);
 assert.match(file, /"account_selected"/);
 assert.match(file, /"account_access_verified"/);
 assert.match(file, /async function validateSelectedGoogleAdsCustomerDirect/);
 assert.match(file, /stage: "google_ads_direct_validation_start"/);
 assert.match(file, /stage: "google_ads_direct_validation_complete"/);
 assert.match(file, /stage: "google_ads_account_discovery_start"/);
 assert.match(file, /stage: "google_ads_account_discovery_complete"/);
 assert.match(file, /stage: "google_ads_account_discovery_skipped"/);
 assert.match(file, /reason: "cached_discovery_valid"/);
 assert.match(file, /stage: "google_ads_connection_persist_start"/);
 assert.match(file, /stage: "google_ads_connection_persist_complete"/);
 assert.match(file, /stage: "google_ads_connection_persist_failed"/);
 assert.match(file, /table: "business_google_ads_connections"/);
 assert.match(file, /operation: "upsert"/);
 assert.match(file, /supabaseCode: input\.error\.code \?\? null/);
 assert.match(file, /supabaseMessage: input\.error\.message \?\? null/);
 assert.match(file, /supabaseDetails: input\.error\.details \?\? null/);
 assert.match(file, /supabaseHint: input\.error\.hint \?\? null/);
 assert.match(file, /status: input\.status \?\? "oauth_connected"/);
 assert.match(file, /status: selected \? "account_selected" : "account_discovery_pending"/);
 assert.match(file, /status: nextStatus/);
 assert.match(file, /selectedCustomerDirectAccessVerified/);
 assert.match(file, /requestId: requestError\.requestId/);
 assert.match(file, /Google Ads is connected\. Account list refresh is temporarily limited by Google, but the selected account is still accessible\./);
 assert.match(file, /Google Ads connected, but Google temporarily limited account lookup\. Try Refresh accounts later\./);
 assert.match(file, /const configuredManagerCustomerId = stripCustomerId\(configuredGoogleAdsLoginCustomerId\(\) \|\| ""\)/);
 assert.match(file, /const managerCustomerId = directAccessPassed/);
 assert.match(file, /resolvedLoginCustomerId: directAccessPassed \? null/);
 assert.doesNotMatch(file, /console\.(info|warn|error)\([^\n]*access_token/);
 assert.doesNotMatch(file, /console\.(info|warn|error)\([^\n]*refresh_token/);
 assert.doesNotMatch(file, /console\.(info|warn|error)\([^\n]*authorization code/);
 assert.doesNotMatch(file, /console\.(info|warn|error)\([^\n]*id_token/);
});

test("google ads callback authorizes the initiating servonas user and honors owner access", async () => {
 const file = await read("../app/api/google-ads/callback/route.ts");
 assert.match(file, /saved\.actorUserId && saved\.actorUserId !== user\.id/);
 assert.match(file, /business\?\.owner_user_id === user\.id/);
 assert.match(file, /canManageBusiness\(resolvedRole\)/);
 assert.match(file, /platformAdminRole/);
 assert.match(file, /persistGoogleAdsOauthConnection/);
 assert.match(file, /discoverGoogleAdsAccounts/);
 assert.match(file, /businessSlug: saved\.businessSlug/);
 assert.match(file, /status: "oauth_connected"/);
 assert.match(file, /force: true/);
 assert.match(file, /const message = discovery\.userMessage/);
 assert.match(file, /Google Ads OAuth completion finished/);
 assert.match(file, /selectedCustomerId: discovery\.selectedCustomerId/);
 assert.match(file, /connectionStatus: discovery\.status/);
 assert.match(file, /discoveryAttempted: true/);
 assert.match(file, /directValidationAttempted: Boolean\(discovery\.selectedCustomerId\) && discovery\.rateLimited/);
 assert.match(file, /rootCustomerCount: discovery\.rootCustomers\.length/);
 assert.match(file, /managerCount: discovery\.rootCustomers\.filter\(\(customer\) => customer\.isManager\)\.length/);
 assert.match(file, /redirectUri: googleAdsRedirectUri\(\)/);
 assert.match(file, /const message = discovery\.userMessage/);
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

test("google ads direct advertisers stay direct even when a manager also exists", () => {
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
 const customer = result.selectableCustomers.find((entry) => entry.id === "1742890521");
 assert.equal(customer?.loginCustomerId ?? null, null);
 assert.equal(customer?.managerCustomerId ?? null, null);
 assert.equal(customer?.source ?? null, "direct");
});

test("google ads diagnostic keeps direct advertiser mode when an associated manager is not selected for login", async () => {
 const [file, page] = await Promise.all([
  read("../lib/googleAdsManagement.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),
 ]);
 assert.match(file, /if \(directAccessPassed && !candidateManagerCustomerId\) \{/);
 assert.match(file, /managerCustomerId: null/);
 assert.match(file, /resolvedLoginCustomerId: null/);
 assert.match(page, /<article><strong>Access mode<\/strong><span>\{validatedManagerLabel \? "Connected through manager access" : "Direct advertiser access"\}<\/span><\/article>/);
 assert.doesNotMatch(page, /<article><strong>Manager account<\/strong><span>145-777-1276<\/span><\/article>/);
});

test("google ads service defaults to a supported api version instead of sunset v20", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /supportedGoogleAdsVersions/);
 assert.match(file, /"v25"/);
 assert.doesNotMatch(file, /"v23\.1"|"v23\.2"|"v24\.1"|"v24\.2"/);
 assert.doesNotMatch(file, /process\.env\.GOOGLE_ADS_API_VERSION\?\.trim\(\) \|\| "v20"/);
});

test("google ads workspace uses beta positioning and separates servonas pricing from google spend", async () => {
 const [page,submit,actions,locationManager,locationRoute,locationSearchRoute]=await Promise.all([
  read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),
  read("../components/GoogleAdsDraftSubmit.tsx"),
  read("../app/app/[businessSlug]/marketing/google-ads/actions.ts"),
  read("../components/GoogleAdsLocationManager.tsx"),
  read("../app/api/google-ads/campaign-locations/[businessSlug]/[campaignId]/route.ts"),
  read("../app/api/google-ads/location-search/[businessSlug]/[campaignId]/route.ts"),
 ]);
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
 assert.match(actions, /const selected = selectedCustomerId \? choices\.find\(\(customer\) => customer\.id === selectedCustomerId\) \?\? null : null/);
 assert.match(actions, /const mutationAccess = resolvedMutationAccess\(connection\.status, connection\.customerChoices, connection\.customerId\)/);
 assert.match(actions, /resolvedAccessMode: mutationAccess\.resolvedAccessMode/);
 assert.match(actions, /resolvedLoginCustomerId: mutationAccess\.resolvedLoginCustomerId/);
 assert.match(actions, /reason: mutationAccess\.reason/);
 assert.match(actions, /async function syncPublishedGoogleAdsCampaignStatuses/);
 assert.match(actions, /google_campaign_resource_name: published\.campaignResourceName/);
 assert.match(actions, /google_campaign_status: snapshot\.status/);
 assert.match(actions, /google_campaign_primary_status: snapshot\.primaryStatus/);
 assert.match(actions, /google_campaign_primary_status_reasons: snapshot\.primaryStatusReasons/);
 assert.match(actions, /await syncPublishedGoogleAdsCampaignStatuses\(/);
 assert.match(page, /Refresh Google Ads accounts/);
 assert.match(page, /account_discovery_retry_after_at/);
 assert.match(page, /selectedAccountVerified/);
 assert.match(page, /fetchGoogleAdsCampaignStatuses/);
 assert.match(page, /Google Ads setup complete/);
 assert.match(page, /Manage connection/);
 assert.match(page, /Additional campaign/);
 assert.match(page, /Create another campaign/);
 assert.match(page, /Build your first campaign/);
 assert.match(page, /Campaign is on — Google is reviewing your ads/);
 assert.match(page, /Campaign is active/);
 assert.match(page, /Google serving status:/);
 assert.doesNotMatch(page, /Campaign is active and eligible to serve/);
 assert.match(page, /Campaign is paused/);
 assert.match(page, /Campaign health/);
 assert.match(page, /Servonas recommends/);
 assert.match(page, /Your maximum bid is too low/);
 assert.match(page, /GoogleAdsBidAdjustment/);
 assert.match(actions, /selectedMaximumBidMicros/);
 assert.match(actions, /requestedCpcMicros/);
 assert.match(page, /Recommended for new campaigns: Maximize Clicks/);
 assert.match(page, /Manage campaign/);
 assert.match(page, /const dailyBudgetLabel = \(micros: number \| string \| null \| undefined\) => `\$\{microsToMoney\(Number\(micros \?\? 0\)\)\}\/day`/);
 assert.match(page, /<strong>\{dailyBudgetLabel\(campaign\.daily_budget_micros\)\}<\/strong>/);
 assert.match(page, /<GoogleAdsManageCampaignControls/);
 const manageControls = await read("../components/GoogleAdsManageCampaignControls.tsx");
 assert.match(manageControls, /<span className="google-ads-budget-readout" aria-label=\{`Current budget \$\{budgetLabel\}`\}>\{budgetLabel\}<\/span>/);
 assert.match(manageControls, /!isEditingBudget/);
 assert.match(manageControls, /Change budget/);
 assert.match(manageControls, /<span>Budget:<\/span>/);
 assert.match(manageControls, /<small>\/ day<\/small>/);
 assert.match(manageControls, /Updating budget…/);
 assert.match(manageControls, /Cancel/);
 assert.doesNotMatch(manageControls, /Edit budget/);
 assert.match(page, /Performance/);
 assert.match(page, /Technical details/);
 assert.match(page, /Keywords &amp; search traffic/);
 assert.match(page, /Manual max CPC/);
 assert.match(page, /Add a new negative keyword below/);
 assert.match(page, /className="google-ads-negative-inline"/);
 assert.match(page, /Published — Paused/);
 assert.match(page, /Published — Active/);
 assert.match(page, /Published — Has issue/);
 assert.match(page, /Removed/);
 assert.match(page, /Sync unavailable/);
 assert.match(page, /Status sync unavailable/);
 assert.match(page, /Unavailable from Google/);
 assert.match(page, /Google campaign status could not be refreshed right now/);
 assert.match(page, /google-ads-status-callout/);
 assert.match(page, /google-ads-health-panel/);
 assert.match(page, /google-ads-health-focus/);
 assert.match(page, /View health details/);
 assert.match(page, /No major setup issues detected\./);
 assert.match(page, /google-ads-overview-grid/);
 assert.match(page, /google-ads-manage-panel/);
 assert.match(page, /google-ads-manage-toolbar/);
 assert.match(manageControls, /google-ads-budget-field/);
 assert.match(page, /google-ads-keyword-section/);
 assert.match(page, /Location targeting/);
 assert.match(page, /Google Ads is the source of truth for where this campaign can appear\./);
 assert.match(page, /GoogleAdsLocationManager/);
 assert.match(locationManager, /Manage locations/);
 assert.match(locationManager, /Add locations/);
 assert.match(locationManager, /No locations currently configured/);
 assert.match(locationManager, /No locations are currently targeted\./);
 assert.match(locationManager, /Search city, county, state, or ZIP/);
 assert.match(locationManager, /Add location/);
 assert.match(locationManager, /Already targeted/);
 assert.match(locationManager, /Excluded locations/);
 assert.match(locationManager, /Targeting behavior/);
 assert.match(locationManager, /People in or interested in these areas/);
 assert.match(locationManager, /People in these areas/);
 assert.match(locationManager, /Removing this location will leave this campaign without any explicit location targeting\./);
 assert.match(locationManager, /Searching…/);
 assert.match(locationManager, /Adding…/);
 assert.match(locationManager, /Removing…/);
 assert.ok(locationManager.includes("/api/google-ads/location-search/${encodeURIComponent(businessSlug)}/${encodeURIComponent(campaignId)}?q=${encodeURIComponent(trimmed)}"));
 assert.ok(locationManager.includes("/api/google-ads/campaign-locations/${encodeURIComponent(businessSlug)}/${encodeURIComponent(campaignId)}"));
 assert.match(locationRoute, /google_ads_location_add_mutation_started/);
 assert.match(locationRoute, /google_ads_location_add_mutation_completed/);
 assert.match(locationRoute, /google_ads_location_add_refetch_started/);
 assert.match(locationRoute, /google_ads_location_add_refetch_completed/);
 assert.match(locationRoute, /google_ads_location_remove_mutation_started/);
 assert.match(locationRoute, /google_ads_location_remove_mutation_completed/);
 assert.match(locationRoute, /google_ads_location_remove_refetch_started/);
 assert.match(locationRoute, /google_ads_location_remove_refetch_completed/);
 assert.doesNotMatch(locationRoute, /redirect\(`/);
 assert.match(locationSearchRoute, /google_ads_location_search_started/);
 assert.match(locationSearchRoute, /google_ads_location_search_completed/);
 assert.match(page, /google-ads-performance-block/);
 assert.match(page, /No traffic yet\./);
 assert.match(page, /Change reporting dates/);
 assert.match(page, /View detailed performance/);
 assert.match(page, /<div><dt>Google status<\/dt><dd>/);
 assert.match(page, /<div><dt>Serving status<\/dt><dd>/);
 assert.match(page, /<div><dt>Issues<\/dt><dd>/);
 assert.match(page, /<div><dt>Last synced<\/dt><dd>/);
 assert.match(page, /Resume campaign/);
 assert.match(page, /Pause campaign/);
 assert.doesNotMatch(page, /refine traffic quality/);
 assert.match(page, /Google Ads is connected\. Account list refresh is temporarily limited by Google, but the selected account is still accessible\./);
 assert.match(page, /Google Ads connected, but Google temporarily limited account lookup\. Try Refresh accounts later\./);
 assert.match(page, /connection\?\.status === "account_access_verified"/);
 assert.match(page, /connection\?\.status === "oauth_connected" \|\| connection\?\.status === "account_discovery_pending" \|\| connection\?\.status === "account_discovery_rate_limited"/);
 const manageSection = page.match(/<section className="google-ads-manage-panel"[\s\S]*?<\/section>/);
 assert.ok(manageSection);
 assert.doesNotMatch(manageSection[0], /Add negative keyword/);
 const styles = await read("../app/globals.css");
 assert.match(styles, /\.google-ads-manage-toolbar\{/);
 assert.match(styles, /\.google-ads-budget-readout\{/);
 assert.match(styles, /\.google-ads-budget-inline-readonly\{/);
 assert.match(styles, /\.google-ads-budget-inline-editor\{/);
 assert.match(styles, /\.google-ads-manage-inline-actions\{/);
 assert.match(styles, /\.google-ads-budget-field/);
 assert.match(styles, /\.google-ads-health-panel/);
 assert.match(styles, /\.google-ads-health-list/);
 assert.match(page, /google-ads-recommendation-card/);
 assert.match(page, /google-ads-recommendation-priority/);
 assert.match(page, /Review suggested keywords/);
 assert.doesNotMatch(page, /<strong>Apply status<\/strong>/);
 assert.match(styles, /\.google-ads-recommendation-card\{overflow:hidden/);
 assert.match(styles, /\.google-ads-recommendation-facts/);
 assert.match(styles, /\.google-ads-health-focus/);
 assert.match(styles, /\.google-ads-setup-details/);
 assert.match(styles, /\.google-ads-performance-empty/);
 assert.match(styles, /\.google-ads-keyword-section\{/);
 assert.match(styles, /\.google-ads-location-panel\{/);
 assert.match(styles, /\.google-ads-location-summary-card\{/);
 assert.match(styles, /\.google-ads-location-list article\{/);
 assert.match(styles, /\.google-ads-location-search\{/);
 assert.match(styles, /@media\(max-width:900px\)\{\.google-ads-manage-toolbar/);
 assert.match(actions, /export async function applyRecommendedGoogleAdsSettingsAction/);
 assert.match(actions, /updateGoogleAdsAdGroupBid/);
 assert.match(actions, /manual_cpc_bid_micros/);
 assert.match(actions, /bidding_strategy/);
});

test("google ads hero keeps setup status, marketing navigation, and latest action together", async () => {
 const [page, styles] = await Promise.all([
  read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),
  read("../app/globals.css"),
 ]);
 assert.match(page, /<section className="google-ads-hero">/);
 assert.match(page, /className="google-ads-hero-copy"/);
 assert.match(page, /className=\{`workspace-panel google-ads-guide/);
 assert.match(page, /google-ads-guide-complete-check/);
 assert.match(page, /google-ads-latest-action/);
 assert.match(styles, /\.google-ads-hero\{display:grid;grid-template-columns:minmax\(0,1\.15fr\) minmax\(360px,\.85fr\)/);
 assert.match(styles, /\.google-ads-guide-complete-check\{display:grid/);
 assert.match(styles, /\.google-ads-latest-action:before\{content:"✓"/);
 assert.match(styles, /@media\(max-width:980px\)\{\.google-ads-hero\{grid-template-columns:1fr/);
});

test("campaign health keeps failed diagnostics unknown and only offers verified recommendations", async () => {
 const [file, actions, page] = await Promise.all([
  read("../lib/googleAdsManagement.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/actions.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),
 ]);
 assert.match(file, /GoogleAdsCampaignHealthDataQuality/);
 assert.match(file, /GoogleAdsCampaignHealthQueryError/);
 assert.match(file, /key\.split\("\."\)\.reduce/);
 assert.match(file, /status: "verified" \| "empty" \| "error"/);
 assert.match(file, /A failed diagnostic query must remain unknown, never become an empty result\./);
 assert.match(file, /googleRequestId: failure\.requestId/);
 assert.match(file, /googleErrorCategory: failure\.googleStatus/);
 assert.match(file, /campaign_health_normalization_mismatch/);
 assert.match(file, /code: "NORMALIZATION_MISMATCH"/);
 assert.match(file, /durationMs: failure\.durationMs/);
 assert.doesNotMatch(file, /healthQuery\("campaign", `SELECT[^`]*campaign\.start_date[^`]*`\)/s);
 assert.match(file, /healthQuery\("adGroups", `SELECT campaign\.id, ad_group\.id, ad_group\.name, ad_group\.status, ad_group\.primary_status, ad_group\.primary_status_reasons, ad_group\.cpc_bid_micros/);
 assert.match(file, /healthQuery\("keywords", `SELECT campaign\.id, ad_group_criterion\.status/);
 assert.match(file, /FROM keyword_view WHERE campaign\.id IN/);
 assert.match(file, /healthQuery\("conversionGoals", "SELECT conversion_action\.category/);
 assert.match(file, /id: "ad_group_unknown"/);
 assert.match(file, /id: "ads_unknown"/);
 assert.match(file, /id: "keywords_unknown"/);
 assert.match(file, /id: "booking_conversion_tracking"/);
 assert.match(file, /input\.snapshot\?\.adGroupNames\[0\]/);
 assert.match(file, /id: "manual_cpc_too_low"/);
 assert.match(file, /cpcBidMicros: String\(input\.cpcBidMicros\)/);
 assert.match(file, /updateMask: "cpc_bid_micros"/);
 assert.match(file, /partialFailure: false/);
 assert.match(file, /Google Ads did not confirm an updated ad group for the CPC change/);
 assert.match(file, /const categorizedIssues = issues\.map/);
 assert.match(file, /"optimization"/);
 assert.match(file, /reviewGoogleAdsCampaignHealthWithAi/);
 assert.match(file, /Only use the supplied verified facts and deterministic findings\. Never invent campaign facts\./);
 assert.match(actions, /confirmCpcFix/);
 assert.match(actions, /recommended_setting_update_readiness_failed/);
 assert.match(actions, /recommended_setting_readiness_check/);
 assert.match(actions, /implementation: "action_specific_manual_cpc_v2"/);
 assert.match(actions, /cpcActionId/);
 assert.match(actions, /randomUUID/);
 assert.match(actions, /fix_cpc_blocked/);
 assert.match(actions, /fetchGoogleAdsManualCpcAdGroups/);
 assert.match(actions, /select\("google_ads_customer_id,google_campaign_id"\)/);
 assert.doesNotMatch(actions, /select\("google_ads_customer_id,google_campaign_id,google_ad_group_id,bidding_strategy/);
 assert.match(actions, /fetchGoogleAdsAdGroupBid/);
 assert.match(actions, /verification = await fetchGoogleAdsAdGroupBid/);
 assert.match(actions, /fix_cpc_started/);
 assert.match(actions, /fix_cpc_ad_group_resolved/);
 assert.match(actions, /fix_cpc_mutation_started/);
 assert.match(actions, /fix_cpc_mutation_completed/);
 assert.match(actions, /fix_cpc_verify_started/);
 assert.match(actions, /fix_cpc_verify_completed/);
 assert.match(actions, /fix_cpc_completed/);
 assert.match(actions, /Google Ads accepted the update, but Servonas could not verify the new bid/);
 assert.doesNotMatch(actions, /This campaign is not ready for recommended setting updates/);
 assert.match(file, /googleAds:searchStream/);
 assert.match(file, /fetchGoogleAdsAdGroupBid[\s\S]*googleAdsSearchStream/);
 assert.doesNotMatch(file, /fetchGoogleAdsAdGroupBid[\s\S]{0,1200}method: "GET"/);
 assert.match(actions, /google_ads_max_cpc_updated/);
 assert.match(page, /Servonas recommends/);
 assert.match(page, /Conversion tracking/);
 assert.doesNotMatch(page, /reviewGoogleAdsCampaignHealthWithAi/);
 assert.match(page, /Some campaign health checks could not be verified\. Verified checks are still shown below\./);
});

test("campaign health implements monitoring grace rules and preserves blockers", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /export const GOOGLE_ADS_NO_IMPRESSION_GRACE_HOURS = 24/);
 assert.match(file, /servingRelevantChangeAt\?: string \| null/);
 assert.match(file, /withinNoImpressionGracePeriod/);
 assert.match(file, /id: "no_impressions_monitoring"/);
 assert.match(file, /No action needed yet\. Servonas will keep monitoring delivery\./);
 assert.match(file, /id: "no_impressions", severity: "warning"/);
 assert.match(file, /Review keyword demand, bidding, targeting, and campaign schedule\./);
 assert.match(file, /servingBlockerIds/);
 assert.match(file, /"campaign_paused"/);
 assert.match(file, /"ads_disapproved"/);
 assert.match(file, /"keywords_inactive"/);
 assert.match(file, /"manual_cpc_too_low"/);
 assert.match(file, /input\.metric\?\.impressions === 0/);
});

test("campaign health AI receives grace-period facts and monitoring guidance", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /withinGracePeriod: input\.withinGracePeriod/);
 assert.match(file, /gracePeriodHoursRemaining: input\.gracePeriodHoursRemaining/);
 assert.match(file, /do not describe zero impressions as a problem or recommend changing bids, targeting, or keyword demand/);
});

test("keyword review uses a fresh verified snapshot and only runs from an explicit action", async () => {
 const [file, actions, page] = await Promise.all([
  read("../lib/googleAdsManagement.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/actions.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),
 ]);
 assert.match(file, /export async function fetchGoogleAdsKeywordReviewSnapshot/);
 assert.match(file, /ad_group_criterion\.criterion_id/);
 assert.match(file, /ad_group_criterion\.keyword\.match_type/);
 assert.match(file, /metrics\.average_cpc/);
 assert.match(file, /export async function reviewGoogleAdsKeywordsWithAi/);
 assert.match(file, /Use only the supplied verified Google Ads facts/);
 assert.match(file, /performanceDataState/);
 assert.match(file, /filter\(\(id: string\) => allowedIds\.has\(id\)\)/);
 assert.match(file, /actionType: "adjust_default_bid" \| "adjust_keyword_bid"/);
 assert.match(file, /googleAdsSuggestedStartingBidMicros/);
 assert.match(file, /canApplyInServonas: actionType === "adjust_keyword_bid" \|\| actionType === "adjust_default_bid"/);
 assert.match(actions, /confirmKeywordBid/);
 assert.match(actions, /googleAdsKeywordBidSafetyCapMicros/);
 assert.match(actions, /fetchGoogleAdsKeywordReviewSnapshot/);
 assert.match(page, /name="keywordIds"/);
 assert.match(page, /Servonas suggested starting point/);
 assert.match(page, /name="maximumBidDollars"/);
 assert.doesNotMatch(page, /keywordLabels\.get\(id\) \?\? id/);
 assert.match(file, /googleAdsKeywordReviewSnapshotHash/);
 assert.match(file, /google_ads_ai_keyword_review_started/);
 assert.match(file, /google_ads_ai_keyword_review_completed/);
 assert.match(file, /google_ads_ai_keyword_review_validation_failed/);
 assert.match(file, /snapshotSummary/);
 assert.match(file, /enabledKeywordCount/);
 assert.match(file, /positiveKeywordCount/);
 assert.match(file, /limitedKeywordCount/);
 assert.match(file, /negativeCount/);
 assert.match(file, /cost: input\.snapshot\.campaign\.costMicros/);
 assert.match(file, /searchTerms: \{ count:/);
 assert.match(file, /conversionGoals: \{ count:/);
 assert.match(file, /keyword\.text/);
 assert.match(file, /bidEstimatesAvailable/);
 assert.match(actions, /export async function reviewGoogleAdsKeywordsAction/);
 assert.match(actions, /fetchGoogleAdsKeywordReviewSnapshot/);
 assert.match(actions, /google_ads_keyword_review_generated/);
 assert.match(actions, /google_ads_ai_keyword_review_cache_checked/);
 assert.match(actions, /google_ads_ai_keyword_review_cache_hit/);
 assert.match(actions, /google_ads_ai_keyword_review_cache_miss/);
 assert.match(actions, /snapshotHash/);
 assert.match(actions, /google_ads_keyword_review_stale/);
 assert.match(actions, /metrics_refresh_changed_ai_input/);
 assert.doesNotMatch(actions.slice(actions.indexOf("export async function refreshGoogleAdsCampaignsAction"), actions.indexOf("export async function searchGoogleAdsCampaignLocationsAction")), /reviewGoogleAdsKeywordsWithAi/);
 assert.match(page, /Review keywords/);
 assert.match(page, /Review again/);
 assert.match(page, /Servonas AI review/);
 assert.match(page, /google_ads_page_external_get_completed/);
 assert.match(page, /google_ads_page_external_get_failed/);
 assert.match(page, /google_ads_ai_keyword_review_cache_checked/);
 assert.match(page, /Google Ads data changed after this review/);
 assert.match(page, /Servonas reviews a fresh Google Ads keyword snapshot only when you request it\./);
 assert.match(page, /No automatic change will be made\./);
 assert.match(actions, /applyGoogleAdsKeywordBidRecommendationAction/);
 assert.match(actions, /confirmKeywordBid/);
 assert.match(actions, /updateGoogleAdsKeywordBid/);
 assert.match(actions, /google_ads_keyword_bid_applied/);
 assert.match(actions, /google_ads_keyword_bid_apply_failed/);
 assert.match(page, /Your ad may not be showing high enough/);
 assert.match(page, /Google has not provided a reliable dollar estimate/);
 assert.match(page, /Apply recommendation/);
 assert.doesNotMatch(page, /reviewGoogleAdsKeywordsWithAi/);
});

test("keyword review keeps its core GAQL snapshot independent from unavailable bid estimates", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /bidEstimates: \{ status: "available" \| "unavailable" \| "error"/);
 assert.match(file, /bidEstimates: \{ status: "unavailable" as const \}/);
 assert.doesNotMatch(file, /ad_group_criterion\.first_page_cpc_micros/);
 assert.doesNotMatch(file, /ad_group_criterion\.top_of_page_cpc_micros/);
 assert.doesNotMatch(file, /ad_group_criterion\.first_position_cpc_micros/);
 assert.match(file, /ad_group_criterion\.primary_status_reasons/);
 assert.match(file, /SELECT ad_group\.id, ad_group\.cpc_bid_micros FROM ad_group/);
 assert.match(file, /fetchGoogleAdsSearchTerms[\s\S]*\.catch\(\(\) => \[\]/);
 assert.match(file, /Bid estimate fields may be unavailable\./);
 assert.match(file, /without inventing a dollar amount/);
 assert.match(file, /never include raw Google IDs, criterion IDs, ad group IDs, campaign IDs, or resource names in customer-facing prose/);
 assert.match(file, /deriveGoogleAdsKeywordBidRecommendations/);
 assert.match(file, /firstPageBidEstimateMicros \* 1\.1/);
 assert.match(file, /keyword\.cpcBidMicros \* 1\.5/);
 assert.match(file, /snapshot\.campaign\.biddingStrategy !== "MANUAL_CPC"/);
 assert.match(file, /adGroupCriteria:mutate/);
 assert.match(file, /Do not recommend removing, pausing, or changing a negative keyword merely because it has zero impressions/);
});

test("keyword review keeps internal IDs out of customer-facing recommendation content", async () => {
 const [actions, page] = await Promise.all([
  read("../app/app/[businessSlug]/marketing/google-ads/actions.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),
 ]);
 assert.match(actions, /keywordDisplays: snapshot\.keywords\.map/);
 assert.match(actions, /matchType: keyword\.matchType/);
 assert.match(actions, /primaryStatusReasons: keyword\.primaryStatusReasons/);
 assert.match(page, /function customerFacingText/);
 assert.match(page, /result\.replace\(\/\\b\\d\{6,\}/);
 assert.match(page, /function readableRecommendationEvidence/);
 assert.match(page, /reviewed negative keyword/);
 assert.match(page, /Relevant keywords/);
 assert.match(page, /savedKeywordReview\.review\.keywordDisplays\.get\(id\) \?\? \{ \.\.\.unresolvedKeyword, id \}/);
 assert.doesNotMatch(page, /keywordLabels\.get\(id\) \?\? id/);
 const recommendationSection = page.slice(page.indexOf('aria-label="AI keyword review"'), page.indexOf('aria-label="Manage campaign"'));
 assert.doesNotMatch(recommendationSection, /Technical details/);
 assert.doesNotMatch(recommendationSection, /Keyword ID:/);
 assert.match(recommendationSection, /Google data/);
 assert.match(recommendationSection, /Apply recommendation/);
});

test("forced keyword reviews log a complete safe snapshot and inventory enrichment stays non-blocking", async () => {
 const [actions, page] = await Promise.all([
  read("../app/app/[businessSlug]/marketing/google-ads/actions.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),
 ]);
 assert.match(actions, /negativeKeywordCount/);
 assert.match(actions, /defaultMaxBidMicros/);
 assert.match(actions, /campaignCostMicros/);
 assert.match(actions, /cacheStatus: forceReview \? "forced_refresh" : null/);
 assert.match(actions, /cacheStatus: forceReview \? "forced_refresh" : "miss"/);
 assert.match(actions, /const cachedReview = forceReview \? null/);
 assert.match(page, /google_ads_page_inventory_read/);
 assert.match(page, /from\("inventory_items"\).*order\("created_at", \{ ascending: false \}\)\.order\("name"\)/);
 assert.doesNotMatch(page, /from\("inventory_items"\)[\s\S]{0,250}order\("sort_order"\)/);
 assert.match(page, /const \[\{ data: services \}, \{ data: inventory \}/);
});

test("manual CPC recommendations remain actionable without a Google bid estimate", async () => {
 const [actions, page] = await Promise.all([
  read("../app/app/[businessSlug]/marketing/google-ads/actions.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),
 ]);
 assert.match(page, /const defaultBidAction = recommendation\.category === "bid" && !bidRecommendation && !bidCandidates\.length && manualCpc/);
 assert.match(page, /Recommended action/);
 assert.match(page, /Google has not provided a reliable dollar estimate/);
 assert.match(page, /Current maximum bid:/);
 assert.match(page, /<summary>Adjust maximum bid<\/summary>/);
 assert.match(page, /The editable starting point below is based on the current bid/);
 assert.match(page, /name="maximumBidDollars" type="number" min="0\.01" step="0\.01"/);
 assert.match(page, /Your daily budget remains/);
 assert.match(page, /Google is managing bids automatically for this campaign, so Servonas cannot safely apply a manual bid change\./);
 assert.match(page, /Servonas could not verify a current Manual CPC bid and target ad group/);
 assert.match(actions, /updateGoogleAdsAdGroupBid/);
 assert.match(actions, /fetchGoogleAdsAdGroupBid/);
 assert.match(actions, /confirmCpcFix/);
 assert.match(actions, /verifiedCpcMicros: verification\.cpcBidMicros/);
});

test("google ads location targeting uses live Google campaign criteria and geo target constant search", async () => {
 const [file, actions, page] = await Promise.all([
  read("../lib/googleAdsManagement.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/actions.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),
 ]);
 assert.match(file, /export type GoogleAdsCampaignLocationTargeting = \{/);
 assert.match(file, /SELECT campaign\.id, campaign_criterion\.criterion_id, campaign_criterion\.resource_name, campaign_criterion\.negative, campaign_criterion\.location\.geo_target_constant FROM campaign_criterion WHERE campaign\.id IN/);
 assert.match(file, /SELECT campaign\.id, campaign\.geo_target_type_setting\.positive_geo_target_type, campaign\.geo_target_type_setting\.negative_geo_target_type FROM campaign WHERE campaign\.id IN/);
 assert.match(file, /SELECT geo_target_constant\.resource_name, geo_target_constant\.id, geo_target_constant\.name, geo_target_constant\.canonical_name, geo_target_constant\.country_code, geo_target_constant\.target_type, geo_target_constant\.status FROM geo_target_constant WHERE geo_target_constant\.resource_name IN/);
 assert.match(file, /const normalizeGeoTargetSearchTerm = \(value: string\)/);
 assert.match(file, /SELECT \$\{fields\} FROM geo_target_constant WHERE geo_target_constant\.status = ENABLED AND geo_target_constant\.name LIKE '%\$\{escaped\}%' LIMIT 12/);
 assert.match(file, /SELECT \$\{fields\} FROM geo_target_constant WHERE geo_target_constant\.status = ENABLED AND geo_target_constant\.canonical_name LIKE '%\$\{escaped\}%' LIMIT 12/);
 assert.match(file, /const merged = new Map<string, GoogleAdsGeoTargetSuggestion>\(\)/);
 assert.match(file, /if \(!resourceName \|\| merged\.has\(resourceName\)\) continue/);
 assert.match(file, /scoreGeoTargetSuggestion\(left, term\) - scoreGeoTargetSuggestion\(right, term\)/);
 assert.match(file, /slice\(0, 12\)/);
 assert.doesNotMatch(file, /geo_target_constant\.status = ENABLED AND \(geo_target_constant\.name LIKE/);
 assert.match(file, /Google Ads geo target search failed/);
 assert.match(file, /searchField: search\.searchField/);
 assert.match(file, /sanitizedQuery: search\.query/);
 assert.match(file, /\/customers\/\$\{stripCustomerId\(input\.customerId\)\}\/campaignCriteria:mutate/);
 assert.match(file, /geoTargetConstant: input\.geoTargetConstant/);
 assert.match(file, /remove: input\.criterionResourceName/);
 assert.match(actions, /export async function addGoogleAdsCampaignLocationAction/);
 assert.match(actions, /export async function removeGoogleAdsCampaignLocationAction/);
 assert.match(actions, /That location is already targeted\./);
 assert.match(actions, /google_ads_campaign_location_added/);
 assert.match(actions, /google_ads_campaign_location_removed/);
 assert.match(page, /fetchGoogleAdsCampaignLocationTargeting/);
 assert.match(page, /campaignLocationSummary/);
 assert.match(page, /friendlyGeoTargetType/);
});

test("google ads status sync stores and reuses the published google campaign resource name", async () => {
 const [actions, file] = await Promise.all([
  read("../app/app/[businessSlug]/marketing/google-ads/actions.ts"),
  read("../lib/googleAdsManagement.ts"),
 ]);
 assert.match(file, /campaignResourceName: typeof campaign === "string" \? campaign : null/);
 assert.match(actions, /google_campaign_resource_name: published\.campaignResourceName/);
 assert.match(actions, /google_campaign_resource_name: snapshot\.campaignResourceName/);
});

test("google ads campaign status sync uses the persisted google campaign id lookup and reads paused enabled removed states", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /SELECT campaign\.id, campaign\.resource_name, campaign\.status, campaign\.primary_status, campaign\.primary_status_reasons FROM campaign WHERE campaign\.id IN/);
 assert.match(file, /SELECT campaign\.id, campaign\.resource_name, campaign\.status, campaign\.primary_status FROM campaign WHERE campaign\.id IN/);
 assert.match(file, /status: String\(readGoogleAdsField<unknown>\(campaign, "status", "status"\) \?\? "UNKNOWN"\)/);
 assert.match(file, /campaignResourceName: typeof readGoogleAdsField<unknown>\(campaign, "resourceName", "resource_name"\) === "string"/);
 assert.match(file, /primaryStatus: typeof readGoogleAdsField<unknown>\(campaign, "primaryStatus", "primary_status"\) === "string"/);
 assert.match(file, /issuesAvailable,\s*}\s*satisfies GoogleAdsCampaignStatusSnapshot/);
});

test("google ads reporting queries use valid custom date range GAQL", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /segments\.date BETWEEN '\$\{normalizeGoogleAdsDate\(dateFrom\)\}' AND '\$\{normalizeGoogleAdsDate\(dateTo\)\}'/);
 assert.match(file, /SELECT campaign\.id, campaign\.name, campaign\.status, metrics\.impressions, metrics\.clicks, metrics\.ctr, metrics\.average_cpc, metrics\.cost_micros, metrics\.conversions, metrics\.cost_per_conversion FROM campaign WHERE campaign\.status != 'REMOVED' AND \$\{dateFilter\}/);
 assert.match(file, /SELECT campaign\.id, campaign\.name, ad_group\.id, ad_group\.name, search_term_view\.search_term, metrics\.impressions, metrics\.clicks, metrics\.ctr, metrics\.conversions, metrics\.cost_micros FROM search_term_view WHERE campaign\.id IN \(\$\{ids\}\) AND \$\{dateFilter\}/);
 assert.ok(file.includes("if (/^\\d{8}$/.test(trimmed)) return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;"));
 assert.doesNotMatch(file, /DURING CUSTOM_DATE_RANGE/);
 assert.match(file, /ctr: impressions > 0 \? clicks \/ impressions : 0/);
});

test("search term workspace keeps Google facts separate from cached AI recommendations and verified exclusions", async () => {
 const [service, actions, page, workspace] = await Promise.all([
  read("../lib/googleAdsManagement.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/actions.ts"),
  read("../app/app/[businessSlug]/marketing/google-ads/page.tsx"),
  read("../components/GoogleAdsSearchTermsWorkspace.tsx"),
 ]);
 assert.match(service, /export type GoogleAdsSearchTermReviewSnapshot/);
 assert.match(service, /metrics\.impressions/);
 assert.match(service, /googleAdsSearchTermReviewSnapshotHash/);
 assert.match(service, /google_ads_search_term_review_started/);
 assert.match(service, /google_ads_search_term_review_completed/);
 assert.match(service, /CONSIDER_EXCLUDING/);
 assert.match(service, /clearly relevant service-intent term with zero conversions/);
 assert.match(service, /fetchGoogleAdsAdGroupNegativeKeywords/);
 assert.match(actions, /reviewGoogleAdsSearchTermsAction/);
 assert.match(actions, /google_ads_search_term_review_cache_hit/);
 assert.match(actions, /google_ads_search_term_review_cache_miss/);
 assert.match(actions, /applyGoogleAdsSearchTermNegativeKeywordsAction/);
 assert.match(actions, /Only current Servonas exclusion recommendations can be applied/);
 assert.match(actions, /google_ads_negative_keyword_add_started/);
 assert.match(actions, /google_ads_negative_keyword_verified/);
 assert.match(actions, /Google Ads did not verify every new negative keyword/);
 assert.match(actions, /normalizeGoogleAdsNegativeKeyword/);
 assert.match(page, /GoogleAdsSearchTermsWorkspace/);
 assert.doesNotMatch(page.slice(page.indexOf("GoogleAdsSearchTermsWorkspace")), /search_term_view/);
 assert.match(workspace, /const \[sort, setSort\].*= useState<keyof Term>\("impressions"\)/);
 assert.match(workspace, /totals\.clicks \/ totals\.impressions/);
 assert.match(workspace, /Filtered total/);
 assert.match(workspace, /Why Servonas suggests this/);
 assert.match(workspace, /const searchTermsPageSize = 25/);
 assert.match(workspace, /const pagedTerms = visible\.slice/);
 assert.match(workspace, /aria-label="Search terms pages"/);
 assert.match(workspace, />Previous<\/button>/);
 assert.match(workspace, />Next<\/button>/);
 assert.match(workspace, /Google data:/);
 assert.match(workspace, /Already excluded/);
 assert.match(workspace, /Add as negative keywords/);
 assert.match(workspace, /role="dialog"/);
 assert.match(workspace, /Search terms are what customers typed, not the keywords you configured/);
 assert.doesNotMatch(workspace, /criterionId|resourceName|adGroupId/);
});

test("google ads page derives pause resume controls from synced google campaign status and treats missing status as sync unavailable", async () => {
 const page = await read("../app/app/[businessSlug]/marketing/google-ads/page.tsx");
 assert.match(page, /const statusSyncUnavailable = Boolean\(campaign\.google_campaign_id\) && !effectiveGoogleStatus/);
 assert.match(page, /effectiveGoogleStatus === "PAUSED" \? "Resume campaign" : "Pause campaign"/);
 assert.match(page, /effectiveGoogleStatus \?\? "Sync unavailable"/);
 assert.match(page, /statusSyncUnavailable \? "Status sync unavailable"/);
 assert.match(page, /!statusSyncUnavailable && effectiveGoogleStatus !== "REMOVED"/);
 assert.match(page, /tone: "review"/);
 assert.match(page, /tone: "healthy"/);
 assert.match(page, /tone: "paused"/);
 assert.match(page, /Campaign is on — Google is reviewing your ads/);
 assert.match(page, /Performance data will appear after your ads begin serving\./);
});

test("google ads page handles secondary reporting query failures without crashing the entire page", async () => {
 const page = await read("../app/app/[businessSlug]/marketing/google-ads/page.tsx");
 assert.match(page, /let metricsError: string \| null = null/);
 assert.match(page, /let statusError: string \| null = null/);
 assert.match(page, /let searchTermsError: string \| null = null/);
 assert.match(page, /metricsError = error instanceof Error \? error\.message : "Campaign metrics could not be loaded\."/);
 assert.match(page, /statusError = error instanceof Error \? error\.message : "Campaign status could not be loaded\."/);
 assert.match(page, /searchTermsError = error instanceof Error \? error\.message : "Search terms could not be loaded\."/);
 assert.match(page, /Performance metrics are temporarily unavailable\./);
 assert.match(page, /Search terms are temporarily unavailable\./);
});

test("google ads page formats last synced in business local time with relative context", async () => {
 const page = await read("../app/app/[businessSlug]/marketing/google-ads/page.tsx");
 assert.match(page, /const formatTimestamp = \(value: string \| null \| undefined, timeZone\?: string \| null\) => \{/);
 assert.match(page, /timeZone: timeZone \|\| undefined/);
 assert.match(page, /timeZoneName: "short"/);
 assert.match(page, /year: "numeric"/);
 assert.match(page, /month: "short"/);
 assert.match(page, /day: "numeric"/);
 assert.match(page, /hour: "numeric"/);
 assert.match(page, /minute: "2-digit"/);
 assert.match(page, /const syncedAt = formatTimestamp\(campaign\.last_sync_at, business\.timezone\)/);
 assert.match(page, /<strong>\{syncedAt\.relative\}<\/strong><small>\{syncedAt\.absolute\}<\/small>/);
 assert.doesNotMatch(page, /new Date\(campaign\.last_sync_at\)\.toLocaleString/);
});

test("google ads mutation resolver prefers proven direct advertiser access over associated manager metadata", async () => {
 const actions = await read("../app/app/[businessSlug]/marketing/google-ads/actions.ts");
 assert.match(actions, /if \(status === "account_access_verified"\) \{/);
 assert.match(actions, /resolvedAccessMode: "direct"/);
 assert.match(actions, /resolvedLoginCustomerId: null/);
 assert.match(actions, /loginCustomerIds: googleAdsPreferredLoginCustomerIds\(\[\]\)/);
 assert.match(actions, /reason: "selected_customer_direct_access_previously_validated"/);
});

test("google ads mutation resolver uses validated manager login customer when the selected advertiser requires one", async () => {
 const actions = await read("../app/app/[businessSlug]/marketing/google-ads/actions.ts");
 assert.match(actions, /if \(selected\?\.loginCustomerId\) \{/);
 assert.match(actions, /resolvedAccessMode: "manager"/);
 assert.match(actions, /resolvedLoginCustomerId: selected\.loginCustomerId/);
 assert.match(actions, /loginCustomerIds: googleAdsPreferredLoginCustomerIds\(\[selected\.loginCustomerId\]\)/);
});

test("google ads publish path does not blindly force associated manager login ids", async () => {
 const [actions, file] = await Promise.all([
  read("../app/app/[businessSlug]/marketing/google-ads/actions.ts"),
  read("../lib/googleAdsManagement.ts"),
 ]);
 assert.doesNotMatch(actions, /loginCustomerIds\(connection\.customerChoices, connection\.customerId\)/);
 assert.doesNotMatch(actions, /loginCustomerIds\(connection\.customerChoices, campaign\.google_ads_customer_id\)/);
 assert.doesNotMatch(file, /const preferred = configuredGoogleAdsLoginCustomerId\(\)/);
 assert.doesNotMatch(file, /input\.loginCustomerId === undefined \? input\.customerId \?\? null : input\.loginCustomerId/);
 assert.doesNotMatch(file, /loginCustomerIds: \[\.\.\.\(input\.loginCustomerIds \?\? \[\]\), input\.customerId, null\]/);
});

test("google ads invalid campaign publish stays bounded, keeps direct mode, and surfaces validation details", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /if \(!input\.suppressFailureDiagnostics && response\.status === 400 && path\.includes\("\/googleAds:mutate"\)\) \{/);
 assert.match(file, /const maxPhaseAttempts = 3/);
 assert.match(file, /const attemptedPayloads = new Set<string>\(\)/);
 assert.match(file, /if \(attemptedPayloads\.has\(fingerprint\)\) continue;/);
 assert.match(file, /suppressFailureDiagnostics: true/);
 assert.match(file, /validateOnly: true/);
 assert.match(file, /mutationAttempt: 1/);
 assert.match(file, /mutationAttempt: 2/);
 assert.match(file, /payloadFingerprint: requestFingerprint/);
 assert.match(file, /operationCount: requestSummary\?\.operationCount \?\? null/);
 assert.match(file, /operationTypes: requestSummary\?\.operationTypes \?\? \[\]/);
 assert.match(file, /if \(error instanceof GoogleAdsRequestError && error\.status === 400 && error\.googleStatus === "INVALID_ARGUMENT"\) \{/);
 assert.match(file, /Google Ads rejected this campaign setup: \$\{detail\.message\}/);
 assert.match(file, /if \(!input\.suppressFailureDiagnostics && response\.status === 400 && path\.includes\("\/googleAds:mutate"\)\) \{/);
 assert.match(file, /manualCpc: \{\}/);
 assert.match(file, /containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"/);
 assert.match(file, /validateOnly: true/);
});

test("google ads atomic mutate assigns temp resource names before cross-resource references", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /const budgetTemp = `\$\{resourceName\("campaignBudgets", customerId\)\}\/-1`/);
 assert.match(file, /const campaignTemp = `\$\{resourceName\("campaigns", customerId\)\}\/-2`/);
 assert.match(file, /const adGroupTemp = `\$\{resourceName\("adGroups", customerId\)\}\/-3`/);
 assert.match(file, /campaignBudgetOperation:\s*{\s*create:\s*{\s*resourceName: budgetTemp,/s);
 assert.match(file, /campaignOperation:\s*{\s*create:\s*{\s*resourceName: campaignTemp,[\s\S]*campaignBudget: budgetTemp,/s);
 assert.match(file, /adGroupOperation:\s*{\s*create:\s*{\s*resourceName: adGroupTemp,[\s\S]*campaign: campaignTemp,/s);
 assert.match(file, /adGroupCriterionOperation:\s*{\s*create:\s*{\s*adGroup: adGroupTemp,/s);
 assert.match(file, /adGroupAdOperation:\s*{\s*create:\s*{\s*adGroup: adGroupTemp,/s);
});

test("google ads search campaign includes manual cpc bidding in the actual mutate payload", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /\.\.\.\(input\.biddingStrategy === "MANUAL_CPC" \? \{ manualCpc: \{\} \} : \{ maximizeClicks: \{\} \}\)/);
 assert.match(file, /networkSettings:\s*{\s*targetGoogleSearch: true,\s*targetSearchNetwork: false,\s*targetContentNetwork: false,\s*targetPartnerSearchNetwork: false,/s);
 assert.match(file, /input\.biddingStrategy === "MANUAL_CPC" && input\.manualCpcBidMicros/);
 assert.doesNotMatch(file, /campaignOperation:\s*{\s*create:\s*{[\s\S]*advertisingChannelType: "SEARCH"[\s\S]*campaignBudget: budgetTemp,\s*}\s*,/s);
});

test("google ads search campaign explicitly declares non-political EU advertising status", async () => {
 const file = await read("../lib/googleAdsManagement.ts");
 assert.match(file, /containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"/);
 assert.doesNotMatch(file, /containsEuPoliticalAdvertising: "CONTAINS_EU_POLITICAL_ADVERTISING"/);
});

test("google ads admin reporting page surfaces beta adoption data", async () => {
 const page = await read("../app/app/admin/marketing/google-ads/page.tsx");
 assert.match(page, /Google Ads beta/);
 assert.match(page, /Business rollout view/);
 assert.match(page, /Recent beta events/);
});

test("marketing funnel page preserves date controls plus requested dates and rental-item analytics", async () => {
 const [page, css] = await Promise.all([
  read("../app/app/[businessSlug]/marketing/funnel/page.tsx"),
  read("../app/globals.css"),
 ]);
 assert.match(page, /name="from"/);
 assert.match(page, /name="to"/);
 assert.match(page, /name="source"/);
 assert.match(page, /Update report/);
 assert.match(page, /Quick filters/);
 assert.match(page, /Requested rental dates/);
 assert.match(page, /Jump to month/);
 assert.match(page, /Most-clicked rental items/);
 assert.match(page, /Customer journey/);
 assert.match(page, /AI Insights/);
 assert.match(page, /Traffic source performance/);
 assert.match(css, /marketing-requested-dates-layout/);
 assert.match(css, /marketing-rental-item-cards/);
});
