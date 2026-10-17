import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {smartUpsellRange,smartUpsellRate,summarizeSmartUpsells} from "../lib/smartUpsellAnalytics.ts";
import {smartUpsellActivationEnabled} from "../lib/smartUpsellSms.ts";

const page=fs.readFileSync("app/app/[businessSlug]/marketing/smart-upsells/page.tsx","utf8");
const actions=fs.readFileSync("app/app/[businessSlug]/marketing/smart-upsells/actions.ts","utf8");

test("accepted offers alone contribute incremental booked revenue and deposits",()=>{
 const summary=summarizeSmartUpsells([
  {status:"accepted",created_at:"2026-10-01",sent_at:"2026-10-01",viewed_at:"2026-10-01",checkout_started_at:"2026-10-01",accepted_at:"2026-10-01",discounted_price_cents:9250,additional_delivery_fee_cents:0,deposit_cents:4625,remaining_balance_increment_cents:4625},
  {status:"sent",created_at:"2026-10-02",sent_at:"2026-10-02",discounted_price_cents:5000,additional_delivery_fee_cents:0,deposit_cents:2500,remaining_balance_increment_cents:2500},
 ]);
 assert.equal(summary.bookedRevenueCents,9250);assert.equal(summary.depositsCollectedCents,4625);assert.equal(summary.remainingBalanceCents,4625);assert.equal(summary.offersSent,2);assert.equal(summary.acceptedOffers,1);assert.equal(summary.conversionRate,.5);
});
test("accepted revenue uses the acceptance period rather than offer creation",()=>{
 const summary=summarizeSmartUpsells([{status:"accepted",created_at:"2026-09-30T12:00:00Z",sent_at:"2026-09-30T12:00:00Z",accepted_at:"2026-10-02T12:00:00Z",discounted_price_cents:9250,additional_delivery_fee_cents:0,deposit_cents:4625,remaining_balance_increment_cents:4625}],{from:"2026-10-01T00:00:00Z",to:"2026-10-03T00:00:00Z"});
 assert.equal(summary.eligibleBookings,0);assert.equal(summary.bookedRevenueCents,9250);assert.equal(summary.acceptedOffers,1);
});
test("conversion rates and empty state avoid misleading division",()=>{assert.equal(smartUpsellRate(1,0),null);assert.equal(smartUpsellRate(0,3),0);assert.equal(smartUpsellRate(2,4),.5);});
test("reporting range retains the tenant timezone and has stable bounds",()=>{
 const range=smartUpsellRange({range:"7d",timezone:"America/Phoenix",now:new Date("2026-10-17T18:00:00Z")});
 assert.equal(range.timezone,"America/Phoenix");assert.equal(range.from,"2026-10-10T18:00:00.000Z");assert.equal(range.to,"2026-10-17T18:00:00.000Z");
});
test("dashboard keeps activation locked and omits secure tokens",()=>{
 assert.match(page,/smartUpsellActivationEnabled/);assert.match(page,/Activation is unavailable/);assert.match(page,/Offer history/);assert.doesNotMatch(page,/token_hash|secure offer token/);
});
test("settings action validates tenant inventory and refuses ungated activation",()=>{
 assert.match(actions,/requireWorkspace/);assert.match(actions,/canManageBusiness/);assert.match(actions,/validateSmartUpsellSettings/);assert.match(actions,/Activation is unavailable until isolated staging validation is complete/);assert.match(actions,/p_business_id:business\.id/);assert.match(actions,/replace_smart_upsell_settings/);assert.match(actions,/ids\.some\(id=>excluded\.includes\(id\)\)/);
});
test("public offer views become persisted lifecycle events without exposing IDs",()=>{
 const source=fs.readFileSync("lib/smartUpsellOfferPage.ts","utf8");assert.match(source,/next_status:"viewed"/);assert.match(source,/if\(offer\.status==="sent"\)/);
});

test("activation requires independent server gates",()=>{
 const prior={sms:process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED,checkout:process.env.SMART_UPSELL_CHECKOUT_PREPARATION_ENABLED,reconciled:process.env.SMART_UPSELL_FINANCIAL_RECONCILIATION_VALIDATED,admin:process.env.SMART_UPSELL_ADMIN_ACTIVATION_ENABLED};
 process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED="true";process.env.SMART_UPSELL_CHECKOUT_PREPARATION_ENABLED="true";process.env.SMART_UPSELL_FINANCIAL_RECONCILIATION_VALIDATED="true";delete process.env.SMART_UPSELL_ADMIN_ACTIVATION_ENABLED;assert.equal(smartUpsellActivationEnabled(),false);process.env.SMART_UPSELL_ADMIN_ACTIVATION_ENABLED="true";assert.equal(smartUpsellActivationEnabled(),true);
 for(const [key,value] of Object.entries(prior)){const envKey={sms:"SMART_UPSELL_AUTOMATED_SMS_ENABLED",checkout:"SMART_UPSELL_CHECKOUT_PREPARATION_ENABLED",reconciled:"SMART_UPSELL_FINANCIAL_RECONCILIATION_VALIDATED",admin:"SMART_UPSELL_ADMIN_ACTIVATION_ENABLED"}[key]!;if(value===undefined)delete process.env[envKey];else process.env[envKey]=value;}
});
