import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {bookingSendDue,hasMarketingSmsConsent,isWithinSmsSendWindow,rankSmartUpsellCandidates} from "../lib/smartUpsellCandidates.ts";
import {defaultSmartUpsellSettings} from "../lib/smartUpsells.ts";

const settings={...defaultSmartUpsellSettings,enabled:true,minimumDiscountedPriceCents:null};
const booking={id:"booking-a",business_id:"business-a",customer_id:"customer-a",status:"confirmed",rental_starts_at:"2027-01-03T17:00:00.000Z",rental_ends_at:"2027-01-03T21:00:00.000Z",customers:{phone_normalized:"+15555550123",sms_consent_status:"express"}} as const;

test("candidate booking requires enabled settings, paid/confirmed status, explicit marketing SMS consent, send window, and lead time",()=>{
 const now=new Date("2027-01-01T17:00:00.000Z");
 assert.equal(bookingSendDue({booking,settings,timezone:"UTC",now,offerCount:0}).eligible,true);
 assert.equal(bookingSendDue({booking,settings:{...settings,sendBeforeEventHours:66},timezone:"UTC",now:new Date("2026-12-30T17:00:00.000Z"),offerCount:0,dailyWindowMinutes:24*60}).reasons.includes("outside_send_lead_window"),true);
 assert.equal(bookingSendDue({booking,settings:{...settings,sendBeforeEventHours:66},timezone:"UTC",now:new Date("2026-12-31T17:00:00.000Z"),offerCount:0,dailyWindowMinutes:24*60}).eligible,true);
 assert.equal(bookingSendDue({booking,settings:{...settings,enabled:false},timezone:"UTC",now,offerCount:0}).reasons.includes("smart_upsells_disabled"),true);
 assert.equal(bookingSendDue({booking:{...booking,customers:{phone_normalized:"+15555550123",sms_consent_status:"opted_out"}},settings,timezone:"UTC",now,offerCount:0}).reasons.includes("marketing_sms_consent_missing"),true);
 assert.equal(bookingSendDue({booking,settings,timezone:"UTC",now,offerCount:1}).reasons.includes("maximum_offers_reached"),true);
 assert.equal(hasMarketingSmsConsent({phone:"+1555",sms_consent_status:"express"}),true);
 assert.equal(hasMarketingSmsConsent({phone:"+1555",sms_consent_status:"opted_out"}),false);
});

test("SMS windows honor tenant local time including overnight windows",()=>{
 assert.equal(isWithinSmsSendWindow(new Date("2027-01-01T10:00:00Z"),"UTC",9,20),true);
 assert.equal(isWithinSmsSendWindow(new Date("2027-01-01T21:00:00Z"),"UTC",9,20),false);
 assert.equal(isWithinSmsSendWindow(new Date("2027-01-01T23:00:00Z"),"UTC",22,6),true);
 assert.equal(isWithinSmsSendWindow(new Date("2027-01-01T12:00:00Z"),"UTC",22,6),false);
});

test("ranking excludes booked, blocked, unconfigured, and unavailable items, then uses deterministic profitability",()=>{
 const ranked=rankSmartUpsellCandidates({items:[{id:"already",name:"Already",daily_price_cents:30000,active:true,stock_quantity:1},{id:"blocked",name:"Blocked",daily_price_cents:30000,active:true,stock_quantity:1},{id:"unavailable",name:"Unavailable",daily_price_cents:30000,active:true,stock_quantity:1},{id:"low",name:"Low",daily_price_cents:1000,active:true,stock_quantity:1},{id:"best",name:"Best",daily_price_cents:20000,active:true,stock_quantity:1,purchase_cost_cents:10000,expected_lifetime_rentals:10},{id:"fallback",name:"Fallback",daily_price_cents:15000,active:true,stock_quantity:1}],requirements:new Map([["already",[{resourceInventoryItemId:"r1",quantityRequired:1}]],["blocked",[{resourceInventoryItemId:"r2",quantityRequired:1}]],["unavailable",[{resourceInventoryItemId:"r3",quantityRequired:1}]],["low",[{resourceInventoryItemId:"r4",quantityRequired:1}]],["best",[{resourceInventoryItemId:"r5",quantityRequired:1}]],["fallback",[{resourceInventoryItemId:"r6",quantityRequired:1}]]]),availableByResource:{r1:1,r2:1,r3:0,r4:1,r5:1,r6:1},blockedItemIds:new Set(["blocked"]),existingItemIds:new Set(["already"]),settings:{...settings,minimumDiscountedPriceCents:1000},taxRateBasisPoints:0,taxEnabled:false,taxDisplayMode:"exclusive"});
 assert.deepEqual(ranked.map(item=>item.inventoryItemId),["best","fallback"]);
 assert.equal(ranked[0].profitabilityMethod,"estimated_equipment_amortization");
 assert.equal(ranked[1].profitabilityMethod,"discounted_revenue_fallback");
});

test("dry run remains server-only and has no mutation path",()=>{
 const source=readFileSync(new URL("../lib/smartUpsellCandidates.ts",import.meta.url),"utf8");
 const dryRun=source.slice(source.indexOf("export async function dryRunSmartUpsellCandidates"),source.indexOf("export async function createSmartUpsellOfferFromCandidate"));
 assert.doesNotMatch(dryRun,/\.insert\(|\.update\(|\.rpc\(/);
 assert.match(readFileSync(new URL("../app/app/[businessSlug]/marketing/smart-upsells/actions.ts",import.meta.url),"utf8"),/requireWorkspace/);
 assert.match(source,/booking_amendment_inventory_holds/);
 assert.match(source,/booking_inventory_reservations/);
});

test("candidate queries and the admin dry run remain tenant-scoped",()=>{
 const source=readFileSync(new URL("../lib/smartUpsellCandidates.ts",import.meta.url),"utf8");
 const action=readFileSync(new URL("../app/app/[businessSlug]/marketing/smart-upsells/actions.ts",import.meta.url),"utf8");
 assert.match(source,/\.eq\("business_id",input\.businessId\)/);
 assert.match(source,/smart_upsell_eligible_inventory_items/);
 assert.match(source,/smart_upsell_excluded_inventory_items/);
 assert.match(action,/businessId:business\.id/);
 assert.match(action,/canManageBusiness\(role\)/);
 assert.match(readFileSync(new URL("../app/app/[businessSlug]/marketing/smart-upsells/page.tsx",import.meta.url),"utf8"),/requireWorkspace/);
});

test("missing physical resource requirements fail closed",()=>{
 const ranked=rankSmartUpsellCandidates({items:[{id:"unverified",name:"Unverified",daily_price_cents:30000,active:true,stock_quantity:1}],requirements:new Map(),availableByResource:{},blockedItemIds:new Set(),existingItemIds:new Set(),settings,taxRateBasisPoints:0,taxEnabled:false,taxDisplayMode:"exclusive"});
 assert.deepEqual(ranked,[]);
});
