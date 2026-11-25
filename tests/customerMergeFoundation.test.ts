import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20261124000100_customer_merge_foundation.sql",import.meta.url),"utf8");

test("customer merge foundation establishes lifecycle and canonical identity guards",()=>{
 assert.match(migration,/merged_into_customer_id is null[\s\S]*is_deleted = true and is_active = false and merged_at is not null/);
 assert.match(migration,/A customer cannot be merged into itself/);
 assert.match(migration,/Customer merge would create a circular reference/);
 assert.match(migration,/resolve_canonical_customer_id/);
 assert.match(migration,/with\(security_invoker=true\)/);
});

test("merge audits are immutable, tenant scoped, and idempotent",()=>{
 assert.match(migration,/create table if not exists public\.customer_merge_audits/);
 assert.match(migration,/unique\(business_id,idempotency_key\)/);
 assert.match(migration,/request_fingerprint/);
 assert.match(migration,/preview_fingerprint/);
 assert.match(migration,/Customer merge audit history is immutable/);
 assert.match(migration,/owners and admins read customer merge audits/);
});

test("alternate contact channels preserve exact-channel consent without public access",()=>{
 assert.match(migration,/create table if not exists public\.customer_contact_channels/);
 assert.match(migration,/channel_type in \('email','phone'\)/);
 assert.match(migration,/consent_status in \('unknown','subscribed','unsubscribed','inbound_contact','express','opted_out'\)/);
 assert.match(migration,/customer_contact_channels_lookup_idx/);
 assert.match(migration,/Seed known profile channels once/);
 assert.match(migration,/sms_opted_out_at,sms_consent_recorded_at/);
 assert.match(migration,/owners and admins manage customer contact channels/);
});

test("legacy SMS duplicate merge cannot bypass the forthcoming audited engine",()=>{
 assert.match(migration,/create or replace function public\.merge_duplicate_customer_contact/);
 assert.match(migration,/Legacy duplicate-contact merge is retired/);
});

test("contact-channel phone constraint accepts normalized E.164 values",()=>{
 assert.match(migration,/normalized_value ~ '\^\\\+\[1-9\]\[0-9\]\{7,14\}\$'/);
 assert.doesNotMatch(migration,/normalized_value ~ '\^\\\\\+\[1-9\]/);
});
