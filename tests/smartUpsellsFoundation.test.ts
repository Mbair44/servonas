import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculateSmartUpsellPrice,canTransitionSmartUpsellOffer,createSmartUpsellToken,defaultSmartUpsellSettings,hashSmartUpsellToken,smartUpsellTokenIsUsable,validateSmartUpsellSettings} from "../lib/smartUpsells.ts";

const sql=readFileSync(new URL("../supabase/migrations/20261017000100_smart_upsells_foundation.sql",import.meta.url),"utf8");

test("Smart Upsell settings are disabled and safe by default",()=>{
 assert.equal(defaultSmartUpsellSettings.enabled,false);
 assert.equal(defaultSmartUpsellSettings.sendBeforeEventHours,48);
 assert.equal(defaultSmartUpsellSettings.discountBasisPoints,5000);
 assert.equal(defaultSmartUpsellSettings.depositBasisPoints,5000);
 assert.throws(()=>validateSmartUpsellSettings({smsSendWindowStartHour:9,smsSendWindowEndHour:9}),/SMS sending window/);
});

test("Smart Upsell price uses integer cents and preserves the amount split",()=>{
 const price=calculateSmartUpsellPrice({originalPriceCents:18500,discountBasisPoints:5000,depositBasisPoints:5000,taxCents:0,taxSnapshot:{method:"manual"}});
 assert.deepEqual({discount:price.discountCents,discounted:price.discountedPriceCents,deposit:price.depositCents,remaining:price.remainingBalanceIncrementCents},{discount:9250,discounted:9250,deposit:4625,remaining:4625});
 const taxed=calculateSmartUpsellPrice({originalPriceCents:101,discountBasisPoints:5000,depositBasisPoints:5000,additionalDeliveryFeeCents:1,taxCents:5,taxSnapshot:{method:"manual"}});
 assert.equal(taxed.depositCents+taxed.remainingBalanceIncrementCents,taxed.discountedPriceCents+taxed.additionalDeliveryFeeCents+taxed.taxCents);
 assert.equal(taxed.taxSnapshot.method,"manual");
});

test("tokens are unpredictable, hashed at rest, and expire safely",()=>{
 const {token,tokenHash}=createSmartUpsellToken();
 assert.equal(tokenHash,hashSmartUpsellToken(token));
 assert.match(tokenHash,/^[a-f0-9]{64}$/);
 assert.equal(smartUpsellTokenIsUsable({status:"sent",expires_at:"2030-01-01T00:00:00.000Z"},new Date("2029-01-01T00:00:00.000Z")),true);
 assert.equal(smartUpsellTokenIsUsable({status:"accepted",expires_at:"2030-01-01T00:00:00.000Z"},new Date("2029-01-01T00:00:00.000Z")),false);
 assert.equal(smartUpsellTokenIsUsable({status:"sent",expires_at:"2020-01-01T00:00:00.000Z"},new Date("2029-01-01T00:00:00.000Z")),false);
});

test("state transitions prevent repeat acceptance",()=>{
 assert.equal(canTransitionSmartUpsellOffer("pending","sent"),true);
 assert.equal(canTransitionSmartUpsellOffer("sent","viewed"),true);
 assert.equal(canTransitionSmartUpsellOffer("checkout_pending","accepted"),true);
 assert.equal(canTransitionSmartUpsellOffer("accepted","accepted"),false);
 assert.equal(canTransitionSmartUpsellOffer("expired","checkout_pending"),false);
});

test("migration has tenant scope, idempotency, RLS, and service-only mutations",()=>{
 assert.match(sql,/business_smart_upsell_settings/);
 assert.match(sql,/smart_upsell_eligible_inventory_items/);
 assert.match(sql,/smart_upsell_excluded_inventory_items/);
 assert.match(sql,/smart_upsell_offers/);
 assert.match(sql,/unique \(business_id, request_key\)/);
 assert.match(sql,/unique \(token_hash\)/);
 assert.match(sql,/Maximum Smart Upsell offers already exist/);
 assert.match(sql,/auth\.role\(\) <> 'service_role'/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/has_business_role\(business_id,array\['owner','admin'\]\)/);
 assert.match(sql,/guard_smart_upsell_offer_transition/);
 assert.match(sql,/has already been accepted/);
 assert.match(sql,/audit_smart_upsell_offer_transition/);
});

test("migration snapshots price and tax without stacking rental promotions",()=>{
 assert.match(sql,/pricing_snapshot jsonb not null/);
 assert.match(sql,/tax_snapshot jsonb not null/);
 assert.match(sql,/discounted_price_cents = original_price_cents - discount_cents/);
 assert.doesNotMatch(sql,/discount_code/);
 assert.match(sql,/deposit_cents \+ remaining_balance_increment_cents = discounted_price_cents \+ additional_delivery_fee_cents \+ tax_cents/);
});
