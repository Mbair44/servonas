import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assertRestrictedSmartUpsellTestBooking,isRestrictedSmartUpsellTestOffer,restrictedSmartUpsellTestConfig} from "../lib/smartUpsellRestrictedTest.ts";

const root=new URL("../",import.meta.url),read=(path:string)=>readFileSync(new URL(path,root),"utf8");
const business="11111111-1111-4111-8111-111111111111",booking="22222222-2222-4222-8222-222222222222";
const keys=["SMART_UPSELL_RESTRICTED_TEST_MODE_ENABLED","SMART_UPSELL_AUTOMATED_SMS_ENABLED","SMART_UPSELL_TEST_BUSINESS_ID","SMART_UPSELL_TEST_BOOKING_ID","SMART_UPSELL_TEST_STRIPE_ACCOUNT_ID","STRIPE_SECRET_KEY"] as const;
function withTestConfig(run:()=>void){const old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));process.env.SMART_UPSELL_RESTRICTED_TEST_MODE_ENABLED="true";delete process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED;process.env.SMART_UPSELL_TEST_BUSINESS_ID=business;process.env.SMART_UPSELL_TEST_BOOKING_ID=booking;process.env.SMART_UPSELL_TEST_STRIPE_ACCOUNT_ID="acct_test123";process.env.STRIPE_SECRET_KEY="sk_test_placeholder";try{run();}finally{for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}}

test("restricted test mode defaults off and requires exact server allowlist plus test Stripe",()=>{
 assert.equal(restrictedSmartUpsellTestConfig(),null);
 withTestConfig(()=>{assert.deepEqual(restrictedSmartUpsellTestConfig(),{businessId:business,bookingId:booking,stripeAccountId:"acct_test123"});assert.doesNotThrow(()=>assertRestrictedSmartUpsellTestBooking(business,booking));assert.throws(()=>assertRestrictedSmartUpsellTestBooking(business,"33333333-3333-4333-8333-333333333333"));assert.equal(isRestrictedSmartUpsellTestOffer({business_id:business,booking_id:booking,offer_metadata:{restricted_test:true}}),true);assert.equal(isRestrictedSmartUpsellTestOffer({business_id:business,booking_id:booking,offer_metadata:{}}),false);});
});

test("SMS disables the restricted test mode and checkout retains server validation",()=>{
 withTestConfig(()=>{process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED="true";assert.equal(restrictedSmartUpsellTestConfig(),null);});
 const checkout=read("lib/smartUpsellCheckout.ts"),staged=read("lib/bookingManage/stagedAmendments.ts"),action=read("app/app/[businessSlug]/marketing/smart-upsells/actions.ts"),route=read("app/api/smart-upsells/[token]/checkout/route.ts");
 assert.match(checkout,/isRestrictedSmartUpsellTestOffer/);assert.match(checkout,/restrictedTestStripeAccountId/);assert.match(staged,/sk_test_/);assert.match(staged,/Stripe test-mode connected account/);assert.match(action,/assertRestrictedSmartUpsellTestBooking/);assert.match(action,/restricted_test:true/);assert.doesNotMatch(action,/sendTenantTwilioMessage|send.*Email/);assert.match(route,/prepareSmartUpsellCheckout/);
});

test("restricted offers reuse the persisted hold, webhook, and amendment flow",()=>{
 const candidate=read("lib/smartUpsellCandidates.ts"),webhook=read("app/api/stripe/webhook/route.ts"),panel=read("components/SmartUpsellRestrictedTestPanel.tsx");
 assert.match(candidate,/restrictedTestBookingId/);assert.match(candidate,/booking_amendment_inventory_holds/);assert.match(webhook,/applyPaidBookingItemAmendment/);assert.match(panel,/Secure test URL/);assert.match(panel,/never sends SMS or email/);
});
