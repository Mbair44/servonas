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
