import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Google Business callback logs every pre-token redirect safely", async () => {
 const callback = await readFile(new URL("../app/api/google-business/callback/route.ts", import.meta.url), "utf8");
 assert.match(callback, /google_business_callback_started/);
 assert.match(callback, /google_business_state_validation_started/);
 assert.match(callback, /google_business_state_validation_completed/);
 assert.match(callback, /google_business_callback_business_resolved/);
 assert.match(callback, /google_business_token_exchange_started/);
 assert.match(callback, /google_business_token_exchange_completed/);
 assert.match(callback, /google_business_callback_failed/);
 assert.match(callback, /google_business_callback_redirected/);
 assert.match(callback, /missing_or_invalid_state_cookie/);
 assert.match(callback, /state_mismatch/);
 assert.match(callback, /missing_servonas_session/);
 assert.match(callback, /workspace_membership_missing/);
 assert.match(callback, /workspace_role_not_permitted/);
 assert.match(callback, /exchangeGoogleBusinessCode\(code\)/);
 assert.match(callback, /redirectUri:/);
 assert.doesNotMatch(callback, /authorizationCode:/);
 assert.doesNotMatch(callback, /accessToken:/);
 assert.doesNotMatch(callback, /refreshToken:/);
});
