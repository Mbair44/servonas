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
 assert.match(file, /Google Ads campaign status query started/);
 assert.match(file, /Google Ads campaign status query completed/);
 assert.match(file, /Google Ads campaign status query failed/);
 assert.match(file, /queryResultCount: snapshots\.length/);
 assert.match(file, /googleCampaignStatus: snapshot\.status/);
 assert.match(file, /servingStatus: snapshot\.primaryStatus/);
 assert.match(file, /syncFailureReason:/);
 assert.match(file, /customer_client/);
 assert.match(file, /mergeGoogleAdsSelectableCustomers/);
 assert.match(file, /login_customer_id/);
 assert.match(file, /search_term_view\.search_term/);
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
 assert.match(page, /<article><strong>Access mode<\/strong><span>\{validatedManagerLabel \? "Manager account" : "Direct advertiser access"\}<\/span><\/article>/);
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
 assert.match(page, /Create another campaign/);
 assert.match(page, /Build your first campaign/);
 assert.match(page, /Published — Paused/);
 assert.match(page, /Published — Active/);
 assert.match(page, /Published — Has issue/);
 assert.match(page, /Removed/);
 assert.match(page, /Sync unavailable/);
 assert.match(page, /Status sync unavailable/);
 assert.match(page, /Google campaign status could not be refreshed right now/);
 assert.match(page, /<div><dt>Google status<\/dt><dd>/);
 assert.match(page, /<div><dt>Serving status<\/dt><dd>/);
 assert.match(page, /<div><dt>Issues<\/dt><dd>/);
 assert.match(page, /<div><dt>Last synced<\/dt><dd>/);
 assert.match(page, /Resume campaign/);
 assert.match(page, /Pause campaign/);
 assert.match(page, /Google Ads is connected\. Account list refresh is temporarily limited by Google, but the selected account is still accessible\./);
 assert.match(page, /Google Ads connected, but Google temporarily limited account lookup\. Try Refresh accounts later\./);
 assert.match(page, /connection\?\.status === "account_access_verified"/);
 assert.match(page, /connection\?\.status === "oauth_connected" \|\| connection\?\.status === "account_discovery_pending" \|\| connection\?\.status === "account_discovery_rate_limited"/);
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
 assert.match(file, /status: String\(readGoogleAdsField<unknown>\(campaign, "status", "status"\) \?\? "UNKNOWN"\)/);
 assert.match(file, /campaignResourceName: typeof readGoogleAdsField<unknown>\(campaign, "resourceName", "resource_name"\) === "string"/);
 assert.match(file, /primaryStatus: typeof readGoogleAdsField<unknown>\(campaign, "primaryStatus", "primary_status"\) === "string"/);
});

test("google ads page derives pause resume controls from synced google campaign status and treats missing status as sync unavailable", async () => {
 const page = await read("../app/app/[businessSlug]/marketing/google-ads/page.tsx");
 assert.match(page, /const statusSyncUnavailable = Boolean\(campaign\.google_campaign_id\) && !effectiveGoogleStatus/);
 assert.match(page, /effectiveGoogleStatus === "PAUSED" \? "Resume campaign" : "Pause campaign"/);
 assert.match(page, /effectiveGoogleStatus \?\? "Sync unavailable"/);
 assert.match(page, /statusSyncUnavailable \? "Status sync unavailable"/);
 assert.match(page, /!statusSyncUnavailable && effectiveGoogleStatus !== "REMOVED"/);
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
 assert.match(file, /campaignOperation:\s*{\s*create:\s*{\s*resourceName: campaignTemp,[\s\S]*advertisingChannelType: "SEARCH",[\s\S]*campaignBudget: budgetTemp,[\s\S]*manualCpc: \{\},[\s\S]*containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",/s);
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
 assert.match(page, /Servonas insights/);
 assert.match(page, /Traffic source performance/);
 assert.match(css, /marketing-requested-dates-layout/);
 assert.match(css, /marketing-rental-item-cards/);
});
