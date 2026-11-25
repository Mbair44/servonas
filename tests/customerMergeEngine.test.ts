import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../supabase/migrations/20261124000200_customer_merge_engine.sql",import.meta.url),"utf8");
test("merge engine exposes authenticated preview and atomic confirmation contracts",()=>{
 assert.match(sql,/customer_merge_preview/);assert.match(sql,/confirm_customer_merge/);assert.match(sql,/CUSTOMER_MERGE_STALE_PREVIEW/);assert.match(sql,/CUSTOMER_MERGE_IDEMPOTENCY_CONFLICT/);assert.match(sql,/for update/);assert.match(sql,/pg_advisory_xact_lock/);
 assert.doesNotMatch(sql,/into b,p,d/);assert.match(sql,/\(x\.primary_customer\)\.\* into p/);
});

test("merge fingerprint migration installs its pgcrypto dependency",()=>{
 assert.match(sql,/create extension if not exists "pgcrypto"/);
 assert.match(sql,/extensions\.digest\(jsonb_build_object/);
});
test("billing and consent fail closed",()=>{
 for(const code of ["BILLING_DISTINCT_STRIPE_CUSTOMERS","BILLING_SAVED_PAYMENT_METHOD","BILLING_AUTOPAY_ENABLED","BILLING_RECURRING_AUTO_CHARGE","BILLING_IN_FLIGHT_ATTEMPT"])assert.match(sql,new RegExp(code));
 assert.match(sql,/consent_status='opted_out'/);assert.match(sql,/CUSTOMER_MERGE_INACTIVE_CUSTOMER_WRITE/);
});
