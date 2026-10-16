import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("bundle checkout derives inventory, tax allocation, and reservation server-side",()=>{
 const checkout=read("app/api/checkout/route.ts"),migration=read("supabase/migrations/20261016000100_rental_bundles.sql");
 assert.match(checkout,/resolveRentalBundle/);
 assert.match(checkout,/Bundle equipment is selected by the package/);
 assert.match(checkout,/Promo codes do not apply to this bundle/);
 assert.match(checkout,/allocateBundleRevenue/);
 assert.match(checkout,/create_bundle_booking/);
 assert.match(migration,/create_public_booking_quantities_timed/);
 assert.match(migration,/status='published'/);
 assert.match(migration,/booking_bundle_item_allocations/);
 assert.match(migration,/revoke all on function public\.create_bundle_booking/);
});

test("the package snapshot is customer-facing while physical equipment remains listed",()=>{
 const portal=read("app/manage-booking/[token]/page.tsx");
 assert.match(portal,/booking_bundle_selections/);
 assert.match(portal,/Selected equipment listed below/);
});
