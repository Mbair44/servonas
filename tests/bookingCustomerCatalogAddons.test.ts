import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20261016000400_booking_customer_catalog_addons.sql",import.meta.url),"utf8");
const jobBuilder=readFileSync(new URL("../lib/rentalBookingJob.ts",import.meta.url),"utf8");

test("booking-originated add-ons retain existing job add-ons and require a tenant-owned subject",()=>{
 assert.match(migration,/alter table public\.job_addons alter column job_id drop not null/);
 assert.match(migration,/check \(job_id is not null or booking_id is not null\)/);
 assert.match(migration,/enforce_job_addon_association_tenant/);
 assert.match(migration,/Job add-on booking tenant does not match/);
 assert.match(migration,/Job add-on catalog tenant does not match/);
 assert.match(migration,/origin in \('admin','customer_checkout'\)/);
});

test("atomic wrapper reuses the locked rental reservation RPC and rolls back add-on work with it",()=>{
 assert.match(migration,/create_public_booking_with_customer_addons/);
 assert.match(migration,/select \* into v_created from public\.create_public_booking_quantities_timed/);
 assert.match(migration,/language plpgsql security definer/);
 assert.match(migration,/begin;[\s\S]*commit;/);
 assert.match(migration,/insert into public\.job_addons\([\s\S]*insert into public\.booking_charge_lines\(/);
 assert.match(migration,/insert into public\.booking_change_audit/);
 assert.match(migration,/for update/);
 assert.match(migration,/balance_due_cents:=greatest\(0,v_booking\.total_cents-coalesce\(v_booking\.amount_paid_cents,0\)\)/);
});

test("customer checkout catalog validation is tenant-scoped, server-priced, and fails closed for inventory",()=>{
 assert.match(migration,/catalog\.business_id=v_business_id/);
 assert.match(migration,/catalog\.is_active[\s\S]*catalog\.customer_visible[\s\S]*catalog\.visibility='public_future'/);
 assert.match(migration,/catalog\.inventory_item_id is not null/);
 assert.match(migration,/requested\.quantity>catalog\.max_customer_quantity/);
 assert.match(migration,/job_addon_applicable_inventory_items/);
 assert.match(migration,/catalog\.compatibility_required/);
 assert.match(migration,/v_addon\.default_unit_price_cents/);
 assert.doesNotMatch(migration,/entry->>'unitPrice/);
});

test("checkout retry keys serialize concurrent attempts and cannot duplicate a catalog line",()=>{
 assert.match(migration,/customer_addon_checkout_requests/);
 assert.match(migration,/primary key \(business_id,request_key\)/);
 assert.match(migration,/pg_advisory_xact_lock/);
 assert.match(migration,/job_addons_customer_checkout_catalog_once/);
 assert.match(migration,/where booking_id is not null and catalog_id is not null and origin='customer_checkout'/);
});

test("job reconciliation links booking add-ons idempotently without changing booking totals",()=>{
 assert.match(jobBuilder,/link_booking_addons_to_existing_job/);
 assert.match(jobBuilder,/link_booking_addons_to_job/);
 assert.match(jobBuilder,/\.eq\("booking_id",booking\.id\)\.is\("job_id",null\)/);
 assert.doesNotMatch(jobBuilder,/job_addons[\s\S]{0,220}total_cents/);
});

const permissionMigration=readFileSync(new URL("../supabase/migrations/20261016000500_lock_down_customer_addon_rpc.sql",import.meta.url),"utf8");
const checkoutRoute=readFileSync(new URL("../app/api/checkout/route.ts",import.meta.url),"utf8");
const adminClient=readFileSync(new URL("../lib/supabaseAdmin.ts",import.meta.url),"utf8");
test("customer add-on RPC is limited to the service-role checkout client",()=>{
 assert.match(permissionMigration,/revoke all[\s\S]*from anon, authenticated/);
 assert.match(permissionMigration,/grant execute[\s\S]*to service_role/);
 assert.match(checkoutRoute,/const supabase = getSupabaseAdmin\(\)/);
 assert.match(checkoutRoute,/supabase\.rpc\("create_public_booking_with_customer_addons"/);
 assert.match(adminClient,/SUPABASE_SERVICE_ROLE_KEY/);
});
