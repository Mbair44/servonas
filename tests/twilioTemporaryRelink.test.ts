import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const action = readFileSync(new URL("../app/app/admin/twilio/TemporaryCopperStateBounceRelinkAction.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../app/app/admin/twilio/TemporaryCopperStateBounceRelink.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/app/admin/twilio/page.tsx", import.meta.url), "utf8");

test("temporary relink is server-only, confirmation-gated, and has no embedded account credential", () => {
 assert.match(action, /^"use server";/);
 assert.match(action, /value\(form, "confirmation"\) !== "RELINK CSB"/);
 assert.match(panel, /type="password"/);
 assert.match(panel, /name="targetAccountSid"/);
 assert.doesNotMatch(action, /AC[0-9a-fA-F]{32}/);
 assert.doesNotMatch(panel, /AC[0-9a-fA-F]{32}/);
 assert.doesNotMatch(action, /\.insert\(|\.delete\(|formRequest\(/);
});

test("relink verifies the entered tenant credentials and all existing resource links before updates", () => {
 assert.match(action, /getSubaccountTwilioHttpClient\(targetAccountSid, targetAuthToken\)/);
 assert.match(action, /Accounts\/\$\{targetAccountSid\}\.json/);
 assert.match(action, /Compliance\/Usa2p\/\$\{campaignSid\}/);
 assert.match(action, /IncomingPhoneNumbers\/\$\{phoneSid\}\.json/);
 assert.match(action, /PhoneNumbers\/\$\{phoneSid\}/);
 assert.match(action, /campaign\.campaign_status\?\.toUpperCase\(\) !== "VERIFIED"/);
 assert.match(action, /brand\.status\?\.toUpperCase\(\) !== "APPROVED"/);
});

test("relink scopes writes to the fixed CSB business, replaces Vault only after verification, and reruns readiness", () => {
 assert.match(action, /const businessId = "cb25acc0-3623-4c06-9041-89a88f4ad6ed"/);
 assert.match(action, /\.eq\("business_id", businessId\)/);
 assert.match(action, /storeSubaccountAuthToken\(\{ businessId, subaccountSid: targetAccountSid, authToken: targetAuthToken \}\)/);
 assert.match(action, /await verifyTenantReadiness\(businessId\)/);
 assert.match(action, /twilio_subaccount_sid: targetAccountSid/);
 assert.match(action, /brand_registration_sid: brandSid, campaign_sid: campaignSid, messaging_service_sid: messagingServiceSid, phone_number_sid: phoneSid/);
 assert.match(action, /twilio_phone_number_sid: phoneSid, phone_number_e164: phone, messaging_service_sid: messagingServiceSid/);
});

test("the temporary panel remains limited to the configured Copper State Bounce test tenant", () => {
 assert.match(panel, /TEMPORARY: remove/);
 assert.match(page, /business\.id==="cb25acc0-3623-4c06-9041-89a88f4ad6ed"&&<TemporaryCopperStateBounceRelink/);
});
