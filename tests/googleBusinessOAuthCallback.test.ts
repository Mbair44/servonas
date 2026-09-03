import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {managementAuthorizationSource} from "../lib/access.ts";

test("workspace authorization follows the canonical management roles",()=>{
 assert.equal(managementAuthorizationSource("owner",false),"workspace_membership");
 assert.equal(managementAuthorizationSource("admin",false),"workspace_membership");
 assert.equal(managementAuthorizationSource(null,true),"platform_admin");
 assert.equal(managementAuthorizationSource(null,false),"none");
 assert.equal(managementAuthorizationSource("manager",false),"none");
});

test("Google Business callback logs stage-by-stage diagnostics without secrets", async () => {
 const callback = await readFile(new URL("../app/api/google-business/callback/route.ts", import.meta.url), "utf8");
 assert.match(callback, /google_business_callback_started/);
 assert.match(callback, /google_business_callback_params_validated/);
 assert.match(callback, /google_business_state_validation_started/);
 assert.match(callback, /google_business_state_validation_completed/);
 assert.match(callback, /google_business_callback_workspace_resolution_started/);
 assert.match(callback, /google_business_callback_workspace_resolution_completed/);
 assert.match(callback, /google_business_oauth_config_validated/);
 assert.match(callback, /google_business_token_exchange_started/);
 assert.match(callback, /google_business_token_exchange_completed/);
 assert.match(callback, /google_business_token_exchange_failed/);
 assert.match(callback, /google_business_credentials_persist_started/);
 assert.match(callback, /google_business_credentials_persist_completed/);
 assert.match(callback, /google_business_account_discovery_started/);
 assert.match(callback, /google_business_account_discovery_completed/);
 assert.match(callback, /google_business_account_discovery_deferred/);
 assert.match(callback, /google_business_callback_completed/);
 assert.match(callback, /google_business_callback_failed/);
 assert.match(callback, /google_business_callback_redirected/);
 assert.match(callback, /google_business_retry_exhausted/);
 assert.match(callback, /state_not_found/);
 assert.match(callback, /state_mismatch/);
 assert.match(callback, /state_business_missing/);
 assert.match(callback, /missing_servonas_session/);
 assert.match(callback, /workspace_membership_missing/);
 assert.match(callback, /workspace_business_mismatch/);
 assert.match(callback, /owner_user_id===user\?\.id/);
 assert.match(callback, /workspace_role_not_permitted/);
 assert.match(callback, /authorizationSource/);
 assert.match(callback, /managementAuthorizationSource/);
 assert.match(callback, /platformAdminRole/);
 assert.match(callback, /oauth_not_configured/);
 assert.match(callback, /exchangeGoogleBusinessCode\(code\)/);
 assert.match(callback, /persistGoogleBusinessConnection/);
 assert.match(callback, /discoverGoogleBusinessLocations/);
 assert.match(callback, /status:"oauth_connected"/);
 assert.match(callback, /status:"account_discovery_rate_limited"/);
 assert.match(callback, /status:"account_discovery_pending"/);
 assert.match(callback, /googleBusinessCallbackId/);
 assert.match(callback, /redirectUriHost/);
 assert.doesNotMatch(callback, /authorizationCode:/);
 assert.doesNotMatch(callback, /accessToken:/);
 assert.doesNotMatch(callback, /clientSecret:/);
});

test("Google Business profile client logs request-level diagnostics and uses discovery cache states", async () => {
 const file = await readFile(new URL("../lib/googleBusinessProfile.ts", import.meta.url), "utf8");
 const migration = await readFile(new URL("../supabase/migrations/20260903000100_google_business_connection_rate_limit_states.sql", import.meta.url), "utf8");
 assert.match(file, /google_business_api_request_started/);
 assert.match(file, /google_business_api_request_completed/);
 assert.match(file, /google_business_api_rate_limited/);
 assert.match(file, /google_business_discovery_deferred/);
 assert.match(file, /google_business_retry_scheduled/);
 assert.match(file, /mybusinessaccountmanagement\.googleapis\.com/);
 assert.match(file, /mybusinessbusinessinformation\.googleapis\.com/);
 assert.match(file, /discoveryCacheTtlMs=5\*60_000/);
 assert.match(file, /discoveryInflight/);
 assert.match(file, /account_discovery_pending/);
 assert.match(file, /account_discovery_rate_limited/);
 assert.match(migration, /'oauth_connected'/);
 assert.match(migration, /'account_discovery_pending'/);
 assert.match(migration, /'account_discovery_rate_limited'/);
 assert.match(migration, /alter column google_account_id drop not null/);
 assert.match(migration, /retry_after_at timestamptz/);
});

test("website settings expose retrying Google Business discovery from the saved connection", async () => {
 const [page,actions,file]=await Promise.all([
  readFile(new URL("../app/app/[businessSlug]/settings/website/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/app/[businessSlug]/settings/website/actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/googleBusinessProfile.ts", import.meta.url), "utf8"),
 ]);
 assert.match(page,/Retry Google lookup/);
 assert.match(page,/Uses the saved Google Business connection\. No reconnect required\./);
 assert.match(actions,/retryGoogleBusinessProfileDiscovery/);
 assert.match(actions,/retryGoogleBusinessLocationDiscovery/);
 assert.match(file,/retryGoogleBusinessLocationDiscovery/);
 assert.match(file,/Reconnect Google Business Profile before retrying account discovery\./);
});
