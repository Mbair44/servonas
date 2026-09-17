import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

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
 assert.doesNotMatch(helper, /booking_number|Your booking #/);
});

async function sendConfirmation(names: string[], overrides: Record<string, unknown> = {}) {
 const messages: { body: string; businessId: string }[] = [];
 const queries: string[] = [];
 const booking = {
  business_id: "tenant-1", booking_number: 57, status: "confirmed", sms_consent: true,
  businesses: { name: "Copper State Bounce" },
  customers: { phone_normalized: "+16025550123", sms_consent_status: "opted_in" },
  delivery_fee_cents: 5000, tax_cents: 1500, discount_cents: 1000,
  booking_items: names.map((name, index) => ({
   rental_date: "2026-09-19", quantity: 1,
   inventory_items: index % 2 ? [{ name }] : { name },
   operator_selected: true, operator_charge_cents: 10000,
  })),
  ...overrides,
 };
 const db = { from(table: string) {
  if (table === "bookings") return { select(query: string) {
   queries.push(query);
   return { eq: () => ({ maybeSingle: async () => ({ data: booking }) }) };
  } };
  assert.equal(table, "job_communication_events");
  return {
   insert: () => ({ select: () => ({ single: async () => ({ data: { id: "event-1" } }) }) }),
   update: () => ({ eq: async () => ({ error: null }) }),
  };
 } };
 const context = vm.createContext({ exports: {}, console, require(id: string) {
  if (id === "@/lib/supabaseAdmin") return { getSupabaseAdmin: () => db };
  if (id === "@/lib/twilio/messageUsage") return { sendTenantTwilioMessage: async (message: typeof messages[number]) => {
   messages.push(message);
   return { sid: "SM-test" };
  } };
  throw new Error(`Unexpected import: ${id}`);
 } });
 vm.runInContext(ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
 await context.exports.sendRentalBookingConfirmationSms("booking-1", "job-1");
 assert.equal(queries.length, 1);
 assert.match(queries[0], /booking_items\(rental_date,inventory_items\(name\)\)/);
 return messages;
}

test("confirmation sends the actual single rental name and requested copy", async () => {
 const messages = await sendConfirmation(["Rainbow Bounce House"]);
 assert.equal(messages.length, 1);
 assert.equal(messages[0].businessId, "tenant-1");
 assert.equal(messages[0].body, "Copper State Bounce: 🎉 You’re booked! Your Rainbow Bounce House rental is confirmed for Sep 19, 2026. We’ll text you again as your event gets closer. Questions? Just reply here. Reply STOP to opt out.");
});

test("confirmation naturally lists two or more rentals without charges or add-ons", async () => {
 for (const [names, expected] of [
  [["Rainbow Bounce House", "Water Slide"], "Rainbow Bounce House and Water Slide"],
  [["Rainbow Bounce House", "Water Slide", "Obstacle Course"], "Rainbow Bounce House, Water Slide, and Obstacle Course"],
 ] as const) {
  const messages = await sendConfirmation([...names], { businesses: [{ name: "Another Rental Business" }] });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body, `Another Rental Business: 🎉 You’re booked! Your ${expected} rental is confirmed for Sep 19, 2026. We’ll text you again as your event gets closer. Questions? Just reply here. Reply STOP to opt out.`);
 }
});

test("confirmation still requires booking consent and respects customer opt-out", async () => {
 assert.equal((await sendConfirmation(["Bounce House"], { sms_consent: false })).length, 0);
 assert.equal((await sendConfirmation(["Bounce House"], { customers: { phone_normalized: "+16025550123", sms_consent_status: "opted_out" } })).length, 0);
});

test("both durable booking-confirmation paths use the shared helper", () => {
 assert.match(checkout, /sendRentalBookingConfirmationSms\(booking\.booking_id,jobId\)/);
 assert.match(webhook, /sendRentalBookingConfirmationSms\(bookingId,jobId\)/);
 assert.match(checkout, /Invoice-later rental confirmation SMS failed/);
 assert.doesNotMatch(webhook, /sendBookingSms\(bookingId,"confirmation"\)/);
});
