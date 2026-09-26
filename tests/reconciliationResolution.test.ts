import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {futureCollectibleRemoved,isCancellationReason} from "../lib/financial/reconciliationResolution.ts";
const migration=readFileSync(new URL("../supabase/migrations/20260926000100_reconciliation_resolution.sql",import.meta.url),"utf8");

test("only supported cancellation reasons are accepted",()=>{assert.equal(isCancellationReason("duplicate_booking"),true);assert.equal(isCancellationReason("invented"),false);});
test("cancellation removes only a non-negative future collectible",()=>{assert.equal(futureCollectibleRemoved(7500),7500);assert.equal(futureCollectibleRemoved(-1),0);});
test("cancellation RPC preserves payment history, disables scheduled charging, and writes immutable audit",()=>{assert.match(migration,/balance_due_cents=0/);assert.match(migration,/balance_charge_scheduled_for=null/);assert.doesNotMatch(migration,/delete from public\.payments/i);assert.match(migration,/reconciliation_resolution_audit/);assert.match(migration,/before_snapshot/);assert.match(migration,/after_snapshot/);assert.match(migration,/actor_user_id/);});
test("resolution RPC enforces tenant role and booking tenant",()=>{assert.match(migration,/has_business_role\(p_business_id/);assert.match(migration,/id=p_booking_id and business_id=p_business_id/);});
test("test cancellation remains historical and is marked explicitly",()=>{assert.match(migration,/is_test_booking/);assert.match(migration,/cancel_test_booking/);});

test("Stripe repair remains explicitly disabled until reusable fulfillment is extracted",async()=>{const {repairStripePayment}=await import("../lib/financial/stripeRepair.ts");assert.deepEqual(await repairStripePayment({businessId:"b",bookingId:"booking",paymentIntentId:"pi",connectedAccountId:"acct"}),{enabled:false,reason:"stripe_repair_not_enabled"});});
