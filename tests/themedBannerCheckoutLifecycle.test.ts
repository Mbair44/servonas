import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("themed banner checkout lifecycle migration is lock-safe and reconcilable",async()=>{
 const migration=await readFile(new URL("../supabase/migrations/20261102000200_themed_banner_checkout_lifecycle.sql",import.meta.url),"utf8");
 for(const expected of ["select distinct banner_id from requested_themed_banners order by banner_id","pg_advisory_xact_lock(hashtextextended(banner_id::text,0))","themed_banner_available_quantity","booking_item_id uuid","job_addons_customer_checkout_catalog_item_once","booking_item_id,banner_id","status in ('pending_payment','paid','confirmed')","bookings_sync_themed_banner_reservations","booking_items_release_themed_banner","themed_banner_checkout_requests","This checkout request belongs to another booking"])assert.ok(migration.includes(expected),expected);
});
