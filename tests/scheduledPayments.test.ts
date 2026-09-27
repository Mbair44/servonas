import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("scheduled payments page exposes safe status filters and retry confirmation",async()=>{
 const page=await read("app/app/[businessSlug]/financials/scheduled-payments/page.tsx");
 assert.match(page,/Upcoming/);assert.match(page,/Failed/);assert.match(page,/Paid/);assert.match(page,/All/);
 assert.match(page,/Confirm \{row\.customer\}/);assert.match(page,/retryScheduledPayment/);
 assert.match(page,/failureReason/);assert.match(page,/paymentMethod/);
});

test("manual retry re-reads booking state and enters the shared billing function",async()=>{
 const [action,billing]=await Promise.all([read("app/app/[businessSlug]/financials/scheduled-payments/actions.ts"),read("lib/financial/recurringBilling.ts")]);
 assert.match(action,/balance_due_cents/);assert.match(action,/cancelled.*canceled.*expired.*refunded/);assert.match(action,/processCompletedJobBilling\(String\(booking\.job_id\),\{force:true\}\)/);
 assert.match(billing,/options:\{force\?:boolean\}/);assert.match(billing,/!options\.force/);assert.match(billing,/idempotencyKey:attemptKey/);assert.match(billing,/existingAttempt\?\.status==="succeeded"/);
});

test("successful ledger payment takes precedence over a stale failed attempt and exposes its completion time",async()=>{
 const page=await read("app/app/[businessSlug]/financials/scheduled-payments/page.tsx");
 assert.match(page,/payment\?\.status==="succeeded"/);assert.match(page,/attempt\?\.completed_at\?\?row\.attempt\?\.attempted_at\?\?row\.payment\?\.paid_at/);
});
test("ledger success synchronizes an attempt idempotently and clears stale failures",async()=>{
 const sql=await read("supabase/migrations/20260926000200_sync_scheduled_payment_attempts.sql");
 assert.match(sql,/new\.status<>'succeeded'/);assert.match(sql,/status='succeeded'/);assert.match(sql,/failure_code=null,failure_reason=null/);assert.match(sql,/provider_payment_intent_id/);assert.match(sql,/billing_audit_events/);
});

test("retry is blocked when the linked Stripe ledger payment already succeeded",async()=>{const action=await read("app/app/[businessSlug]/financials/scheduled-payments/actions.ts");assert.match(action,/provider_payment_intent_id,paid_at/);assert.match(action,/eq\("status","succeeded"\)/);assert.match(action,/Stripe already captured this payment/);});
