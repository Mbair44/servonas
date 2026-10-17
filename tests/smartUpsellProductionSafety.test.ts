import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {calculateSmartUpsellTaxCents} from "../lib/smartUpsellCheckout.ts";
import {smartUpsellAutomationReady} from "../lib/smartUpsellSms.ts";

const read=(path:string)=>fs.readFileSync(path,"utf8");
const additions=read("lib/bookingManage/addRentalItems.ts");
const staged=read("lib/bookingManage/stagedAmendments.ts");
const cron=read("app/api/cron/financial/route.ts");
const checkout=read("lib/smartUpsellCheckout.ts");
const sms=read("lib/smartUpsellSms.ts");
const callback=read("app/api/twilio/tenant-message-status/route.ts");
const migration=read("supabase/migrations/20261017000300_smart_upsell_sms_delivery.sql");

test("ordinary amendments retain the established canonical RPC",()=>{
 assert.match(additions,/smart_upsell_offer_id/);
 assert.match(additions,/The Smart Upsell amendment is invalid/);
 assert.match(additions,/Ordinary amendments continue through their established canonical RPC/);
 assert.match(additions,/rpc\("add_rental_items_to_booking",/);
 assert.match(additions,/rpc\("add_rental_items_to_booking_tax_correct",/);
 assert.match(staged,/if\(smartOfferId&&before\?\.balance_charge_scheduled_for\)/);
 assert.match(cron,/activeSmartUpsell/);
 assert.match(cron,/smart_upsell_offer_id/);
});

test("tax calculation uses an explicit item classification and fails closed when missing",()=>{
 const base={discountedPriceCents:9250,taxEnabled:true,taxCalculationMethod:"manual",taxDisplayMode:"exclusive",taxRateBasisPoints:820,customerTaxExempt:false};
 assert.equal(calculateSmartUpsellTaxCents({...base,itemTaxable:true}),759);
 assert.equal(calculateSmartUpsellTaxCents({...base,itemTaxable:false}),0);
 assert.equal(calculateSmartUpsellTaxCents({...base,customerTaxExempt:true,itemTaxable:true}),0);
 assert.throws(()=>calculateSmartUpsellTaxCents({...base,itemTaxable:null}),/missing its tax classification/);
 assert.throws(()=>calculateSmartUpsellTaxCents({...base,taxCalculationMethod:"automatic",itemTaxable:true}),/address-aware tax reconciliation/);
 assert.match(checkout,/select\("id,business_id,active,is_taxable"\)/);
});

test("automated SMS requires checkout readiness as well as the SMS gate",()=>{
 const keys=["SMART_UPSELL_AUTOMATED_SMS_ENABLED","SMART_UPSELL_CHECKOUT_PREPARATION_ENABLED","SMART_UPSELL_FINANCIAL_RECONCILIATION_VALIDATED"] as const;
 const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED="true";delete process.env.SMART_UPSELL_CHECKOUT_PREPARATION_ENABLED;delete process.env.SMART_UPSELL_FINANCIAL_RECONCILIATION_VALIDATED;
 assert.equal(smartUpsellAutomationReady(),false);
 process.env.SMART_UPSELL_CHECKOUT_PREPARATION_ENABLED="true";process.env.SMART_UPSELL_FINANCIAL_RECONCILIATION_VALIDATED="true";
 assert.equal(smartUpsellAutomationReady(),true);
 for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
 assert.match(sms,/if\(!smartUpsellAutomationReady\(\)\)/);
 assert.match(sms,/Checkout validation gate is unavailable; SMS was not sent/);
});

test("SMS queue remains service-role writable and an unavailable queue cannot break normal callbacks",()=>{
 assert.match(migration,/grant select on public\.smart_upsell_sms_deliveries to authenticated/);
 assert.match(migration,/grant all on public\.smart_upsell_sms_deliveries to service_role/);
 assert.doesNotMatch(migration,/grant (insert|update|delete|all) on public\.smart_upsell_sms_deliveries to authenticated/);
 assert.match(callback,/Smart Upsell queue is unavailable; continuing established callback processing/);
 assert.match(callback,/Smart Upsell callback bookkeeping failed; continuing established callback processing/);
 assert.doesNotMatch(callback,/recordSmartUpsellSmsDeliveryStatus\(.*\}catch\{return NextResponse\.json\(\{error:"Callback persistence failed"/s);
});
