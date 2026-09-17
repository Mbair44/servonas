import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const helper = readFileSync(new URL("../lib/communications/rentalBookingConfirmationSms.ts", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../app/api/checkout/route.ts", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");

test("confirmation SMS is consent-gated, tenant-scoped, and atomically claimed", () => {
 assert.match(helper, /if \(!booking\.sms_consent\)/);
 assert.match(helper, /customer\.sms_consent_status === "opted_out"/);
 assert.match(helper, /sendTenantTwilioMessage\(\{ businessId: booking\.business_id/);
 assert.match(helper, /sourceType: "booking_confirmation"/);
 assert.match(helper, /event\.error\?\.code === "23505"/);
 assert.match(helper, /Reply STOP to opt out/);
 assert.match(helper, /Your booking #\$\{bookingNumber\} is confirmed/);
});

test("both durable booking-confirmation paths use the shared helper", () => {
 assert.match(checkout, /sendRentalBookingConfirmationSms\(booking\.booking_id,jobId\)/);
 assert.match(webhook, /sendRentalBookingConfirmationSms\(bookingId,jobId\)/);
 assert.match(checkout, /Invoice-later rental confirmation SMS failed/);
 assert.doesNotMatch(webhook, /sendBookingSms\(bookingId,"confirmation"\)/);
});
