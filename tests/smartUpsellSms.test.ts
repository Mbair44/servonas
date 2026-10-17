import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {isWithinSmsSendWindow} from "../lib/smartUpsellCandidates.ts";
import {smartUpsellAutomatedSmsEnabled,smartUpsellSmsBody} from "../lib/smartUpsellSms.ts";

const scheduler=fs.readFileSync("lib/smartUpsellSms.ts","utf8");
const cron=fs.readFileSync("app/api/cron/smart-upsells/route.ts","utf8");
const migration=fs.readFileSync("supabase/migrations/20261017000300_smart_upsell_sms_delivery.sql","utf8");

test("SMS scheduler is disabled unless its server-only flag is exact true",()=>{
 const prior=process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED;delete process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED;assert.equal(smartUpsellAutomatedSmsEnabled(),false);process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED="true";assert.equal(smartUpsellAutomatedSmsEnabled(),true);if(prior===undefined)delete process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED;else process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED=prior;
});
test("offer SMS is personalized, includes price, link, and opt-out language",()=>{
 const body=smartUpsellSmsBody({firstName:"Avery",eventStart:"2026-11-06T19:00:00Z",timezone:"America/Phoenix",itemName:"Castle Bounce House",discountedPriceCents:9250,originalPriceCents:18500,offerLink:"https://example.test/upsell/token",businessName:"Example Bounce"});
 assert.match(body,/Hey Avery/);assert.match(body,/\$92\.50/);assert.match(body,/\$185\.00/);assert.match(body,/Reply STOP to opt out/);assert.match(body,/https:\/\/example\.test\/upsell\/token/);
});
test("tenant-local SMS windows handle normal and overnight schedules",()=>{
 const noon=new Date("2026-11-06T19:00:00Z");assert.equal(isWithinSmsSendWindow(noon,"America/Phoenix",9,20),true);assert.equal(isWithinSmsSendWindow(noon,"America/Phoenix",20,9),false);
 const late=new Date("2026-11-07T05:00:00Z");assert.equal(isWithinSmsSendWindow(late,"America/Phoenix",20,9),true);
});
test("durable queue is tenant-scoped, unique per offer, and source uses central sender",()=>{
 assert.match(migration,/offer_id uuid not null unique/);assert.match(migration,/enable row level security/);assert.match(migration,/Smart Upsell SMS delivery tenant association is invalid/);
 assert.match(scheduler,/customer_sms_consents/);assert.match(scheduler,/sms_consent_status!=="express"/);assert.match(scheduler,/status===\"opted_out\"/);assert.match(scheduler,/sendTenantTwilioMessage/);assert.match(scheduler,/token_hash!==hashSmartUpsellToken/);
});
test("scheduler and cron remain feature-gated and dry run stays side-effect free",()=>{
 assert.match(cron,/smartUpsellAutomationReady/);assert.match(cron,/scheduleSmartUpsellOffers/);assert.match(scheduler,/if\(!smartUpsellAutomationReady\(\)\)/);
 const dry=fs.readFileSync("lib/smartUpsellCandidates.ts","utf8");assert.match(dry,/read-only candidate report/);assert.doesNotMatch(dry,/smart_upsell_sms_deliveries/);
});
