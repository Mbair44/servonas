import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../lib/communications/rentalPaymentRequest.ts",import.meta.url),"utf8");
const controls=readFileSync(new URL("../components/ManageBookingLinkControls.tsx",import.meta.url),"utf8");
test("deposit requests require current explicit SMS consent and use the tenant service",()=>{assert.match(source,/booking\.sms_consent/);assert.match(source,/sms_consent_status===\"express\"/);assert.match(source,/phoneConsent\?\.status===\"express\"/);assert.match(source,/sendTenantTwilioMessage\(\{businessId:booking\.business_id/);assert.match(source,/stripe\.checkout\.sessions\.create/);assert.match(source,/stripeAccount:account\.provider_account_id/);});
test("staff can send, copy, and resend a secure payment request without card access",()=>{assert.match(controls,/Create booking &amp; send payment request/);assert.match(controls,/Copy payment link/);assert.match(controls,/Resend text/);assert.match(controls,/Staff never see card information/);});
