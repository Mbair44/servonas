import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const helper = read("../lib/communications/rentalLifecycleSms.ts");
const cron = read("../app/api/cron/messages/route.ts");
const dispatch = read("../app/app/[businessSlug]/dispatch/actions.ts");
const jobs = read("../app/app/[businessSlug]/jobs/actions.ts");
const technician = read("../app/tech/actions.ts");
const billing = read("../lib/financial/recurringBilling.ts");
const stripeWebhook = read("../app/api/stripe/webhook/route.ts");
const offlinePayments = read("../app/app/[businessSlug]/invoices/actions.ts");
const migration = read("../supabase/migrations/20260917000100_rental_lifecycle_sms_events.sql");

test("rental lifecycle SMS requires current affirmative booking, customer, and phone consent", () => {
  assert.match(helper, /!booking\.sms_consent/);
  assert.match(helper, /customer\.sms_consent_status !== "express"/);
  assert.match(helper, /phoneConsent\?\.status !== "express"/);
  assert.match(helper, /sendTenantTwilioMessage\(\{ businessId: booking\.business_id/);
  assert.match(helper, /Reply STOP to opt out/);
});

test("lifecycle events are atomically idempotent and retain Twilio delivery state", () => {
  assert.match(helper, /event_key: eventKey/);
  assert.match(helper, /event\.error\?\.code === "23505"/);
  assert.match(helper, /status: "queued"/);
  assert.match(helper, /provider_message_id: sent\.sid/);
  assert.match(helper, /status: "failed"/);
  assert.match(migration, /job_communication_events_rental_lifecycle_sms_dedupe/);
  assert.match(migration, /'reminder', 'technician_en_route', 'review_request', 'payment_receipt'/);
});

test("existing reminder and review timing now uses tenant lifecycle SMS", () => {
  assert.match(cron, /sendRentalLifecycleSms\(\{ bookingId, type: "reminder" \}\)/);
  assert.match(cron, /sendRentalLifecycleSms\(\{ bookingId, type: "review_request" \}\)/);
  assert.doesNotMatch(cron, /sendBookingSms/);
});

test("on-the-way and durable payment success paths trigger their lifecycle SMS", () => {
  assert.match(dispatch, /type: "technician_en_route"/);
  assert.match(jobs, /type: "technician_en_route"/);
  assert.match(technician, /type:"technician_en_route"/);
  assert.match(billing, /paymentId: payment\.id, type: "payment_receipt"/);
  assert.match(offlinePayments, /paymentId:payment\.id,type:"payment_receipt"/);
  assert.match(stripeWebhook, /paymentId:payment\.id,type:"payment_receipt"/);
  assert.match(helper, /payment_not_succeeded/);
});
