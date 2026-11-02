import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("themed banner migration is tenant-scoped and capacity-aware",async()=>{
 const sql=await readFile(new URL("../supabase/migrations/20261102000100_themed_banner_addons.sql",import.meta.url),"utf8");
 assert.match(sql,/rental_themed_banners/);
 assert.match(sql,/rental_themed_banner_compatible_inventory/);
 assert.match(sql,/booking_themed_banner_reservations/);
 assert.match(sql,/physical_quantity integer not null default 1/);
 assert.match(sql,/acquisition_cost_cents integer not null default 0/);
 assert.match(sql,/enforce_themed_banner_tenant/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/booking\.status in \('pending_payment','paid','confirmed'\)/);
});
