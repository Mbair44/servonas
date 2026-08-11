import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {calculateMessagingPeriod,nextMonth,shouldAdvanceMessageStatus,usageCanFinalize,utcBillingPeriod} from "../lib/twilio/usageMath.ts";

const read=(path:string)=>readFile(new URL(path,import.meta.url),"utf8");

test("duplicate Twilio Message SIDs are protected per account",async()=>{const sql=await read("../supabase/migrations/20260810000700_twilio_usage_billing_foundation.sql"),source=await read("../lib/twilio/messageUsage.ts");assert.match(sql,/unique\(twilio_account_sid,twilio_message_sid\)/);assert.match(source,/error\.code==="23505"/);});

test("outbound finalized SMS usage counts segments rather than message rows",()=>{const rows=[{direction:"outbound-api",channel:"sms",num_segments:3,usage_finalized_at:"2026-08-10T00:00:00Z",twilio_price:"-0.03",twilio_price_unit:"USD"},{direction:"outbound-reply",channel:"sms",num_segments:2,usage_finalized_at:"2026-08-10T00:00:00Z",twilio_price:"-0.02",twilio_price_unit:"USD"},{direction:"inbound",channel:"sms",num_segments:4,usage_finalized_at:"2026-08-10T00:00:00Z",twilio_price:"-0.01",twilio_price_unit:"USD"}];const result=calculateMessagingPeriod(rows,4);assert.equal(result.billableUnits,5);assert.equal(result.overageUnits,1);assert.ok(Math.abs(result.providerCost-0.06)<0.000001);});

test("inbound and outbound tenant attribution is captured without rewiring legacy senders",async()=>{const inbound=await read("../app/api/twilio/inbound/route.ts"),sender=await read("../lib/twilio/messageUsage.ts"),legacy=await read("../lib/communications/customerCampaignDelivery.ts");assert.match(inbound,/security\.mode==="tenant"/);assert.match(inbound,/direction:"inbound"/);assert.match(sender,/direction:message\.direction\?\?"outbound-api"/);assert.match(legacy,/getTwilioCredentials/);assert.doesNotMatch(legacy,/sendTenantTwilioMessage|resolveTenantOutboundSender/);});

test("late price population prevents premature usage finalization",()=>{assert.equal(usageCanFinalize({status:"delivered",numSegments:2,numMedia:0,price:null,priceUnit:null}),false);assert.equal(usageCanFinalize({status:"delivered",numSegments:2,numMedia:0,price:-0.02,priceUnit:"USD"}),true);assert.equal(usageCanFinalize({status:"accepted",numSegments:2,numMedia:0,price:-0.02,priceUnit:"USD"}),false);});

test("out-of-order status callbacks cannot downgrade a terminal status",()=>{assert.equal(shouldAdvanceMessageStatus("sent","delivered"),true);assert.equal(shouldAdvanceMessageStatus("delivered","sent"),false);assert.equal(shouldAdvanceMessageStatus("read","delivered"),false);assert.equal(shouldAdvanceMessageStatus("queued","sending"),true);});

test("billing periods use UTC calendar months",()=>{assert.equal(utcBillingPeriod("2026-08-31T23:59:59Z"),"2026-08-01");assert.equal(nextMonth("2026-12-01"),"2027-01-01");});

test("included units and overage are calculated independently from provider cost",()=>{const result=calculateMessagingPeriod([{direction:"outbound-api",channel:"sms",num_segments:12,usage_finalized_at:"2026-08-10T00:00:00Z",twilio_price:"-0.094",twilio_price_unit:"USD"}],10);assert.equal(result.includedUnits,10);assert.equal(result.overageUnits,2);assert.equal(result.providerCost,0.094);});

test("tenant isolation is enforced for usage and billing reports",async()=>{const sql=await read("../supabase/migrations/20260810000700_twilio_usage_billing_foundation.sql"),route=await read("../app/api/admin/twilio/usage/[businessId]/route.ts");assert.match(sql,/has_business_role\(business_id,array\['owner','admin'\]\)/);assert.match(sql,/foreign key\(business_id,business_twilio_account_id\)/);assert.match(route,/requireTwilioPlatformAdmin/);assert.match(route,/getMessagingPeriodReport\(businessId/);});

test("a finalized month is immutable to repeated calculation",async()=>{const source=await read("../lib/twilio/messageUsage.ts");assert.match(source,/existing\?\.status==="finalized"\)return existing/);assert.match(source,/unfinalizedMessageCount===0/);});

test("usage foundation has no Stripe billing side effects",async()=>{const source=await read("../lib/twilio/messageUsage.ts"),route=await read("../app/api/cron/financial/route.ts"),sql=await read("../supabase/migrations/20260810000700_twilio_usage_billing_foundation.sql");assert.doesNotMatch(source,/new Stripe|stripe\.invoice|usageRecords|invoiceItems/);assert.doesNotMatch(route,/new Stripe|stripe\.invoice|usageRecords|invoiceItems/);assert.match(sql,/stripe_billing_status text not null default 'not_billed'/);});
