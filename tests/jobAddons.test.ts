import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20261015000100_admin_job_addons.sql",import.meta.url),"utf8");
const actions=readFileSync(new URL("../app/app/[businessSlug]/jobs/actions.ts",import.meta.url),"utf8");
const jobPage=readFileSync(new URL("../app/app/[businessSlug]/jobs/[jobId]/page.tsx",import.meta.url),"utf8");
const portal=readFileSync(new URL("../app/manage-booking/[token]/page.tsx",import.meta.url),"utf8");

test("admin-only add-ons use tenant-scoped canonical booking charge lines",()=>{
 assert.match(migration,/create table if not exists public\.job_addon_catalog/);
 assert.match(migration,/visibility text not null default 'admin_only'/);
 assert.match(migration,/create table if not exists public\.booking_charge_lines/);
 assert.match(migration,/job_addon_id uuid unique/);
 assert.match(migration,/p_business_id/);
 assert.match(migration,/has_business_role\(p_business_id,array\['owner','admin','manager'\]\)/);
});

test("saving an add-on preserves discounts and payment history while updating only the current balance",()=>{
 assert.match(migration,/balance_due_cents=v_balance/);
 assert.match(migration,/balance_charge_scheduled_for=case when v_balance=0 then null else balance_charge_scheduled_for end/);
 assert.match(migration,/booking_change_audit/);
 assert.doesNotMatch(migration,/set[^;]*discount_cents/);
 assert.doesNotMatch(migration,/insert into public\.payments/);
 assert.doesNotMatch(migration,/stripe|refund/i);
});

test("draft invoices receive itemized add-ons while finalized invoices are never rewritten",()=>{
 assert.match(migration,/v_invoice\.status='draft'/);
 assert.match(migration,/invoice_line_items/);
 assert.match(migration,/delete from public\.invoice_line_items[\s\S]*i\.status='draft'/);
 assert.doesNotMatch(migration,/update public\.invoices set[\s\S]{0,700}status='sent'/);
});

test("job UI uses server actions and customer booking portal displays attached charges",()=>{
 assert.match(actions,/save_job_addon/);
 assert.match(actions,/remove_job_addon/);
 assert.match(jobPage,/JobAddonsPanel/);
 assert.match(portal,/booking_charge_lines/);
 assert.match(portal,/line\.name_snapshot/);
});

test("Copper State Bounce generator catalog seed is additive and admin only",()=>{
 assert.match(migration,/Generator Rental/);
 assert.match(migration,/15000/);
 assert.match(migration,/admin_only/);
 assert.match(migration,/on conflict\(business_id,name\) do nothing/);
});
