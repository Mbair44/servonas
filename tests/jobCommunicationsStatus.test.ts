import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/app/[businessSlug]/jobs/[jobId]/page.tsx", import.meta.url), "utf8");

test("job detail reads existing consent and tenant delivery records for its communications panel", () => {
 assert.match(page, /sms_consent,sms_consent_recorded_at,sms_consent_source/);
 assert.match(page, /customer_sms_consents/);
 assert.match(page, /twilio_message_usage/);
 assert.match(page, /source_type","booking_confirmation"/);
 assert.match(page, /<h2>Communications<\/h2>/);
 assert.match(page, /Text updates/);
 assert.match(page, /Confirmation SMS/);
 assert.match(page, /provider_error_message/);
});
