import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {bookingBalanceForTotal} from "../lib/financial/bookingBalance.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("rental swap atomically releases A and reserves B without recreating the booking",async()=>{
 const migration=await read("supabase/migrations/20260915000300_swap_booked_rental_item.sql");
 assert.match(migration,/for update/);
 assert.match(migration,/delete from public\.booking_inventory_reservations where booking_item_id=v_item\.id/);
 assert.match(migration,/update public\.booking_items set inventory_item_id=p_new_inventory_item_id where id=v_item\.id/);
 assert.match(migration,/insert into public\.booking_inventory_reservations/);
 assert.doesNotMatch(migration,/delete from public\.bookings/);
});

test("rental swap rejects overlapping unavailable resources before deleting the old reservation",async()=>{
 const migration=await read("supabase/migrations/20260915000300_swap_booked_rental_item.sql");
 const conflict=migration.indexOf("is already reserved for that rental period");
 const release=migration.indexOf("delete from public.booking_inventory_reservations");
 assert.ok(conflict>0&&release>conflict);
 assert.match(migration,/reservation\.booking_item_id<>v_item\.id/);
 assert.match(migration,/pg_advisory_xact_lock/);
});

test("rental swap preserves payments and lets the existing financial sync recalculate balance",async()=>{
 const [migration,actions]=await Promise.all([read("supabase/migrations/20260915000300_swap_booked_rental_item.sql"),read("app/app/[businessSlug]/jobs/actions.ts")]);
 assert.doesNotMatch(migration,/amount_paid_cents\s*=/);
 assert.match(actions,/bookingBalanceForTotal\(updatedTotalCents,booking\.amount_paid_cents\)/);
 assert.match(actions,/swap_booking_rental_item/);
 assert.deepEqual(bookingBalanceForTotal(15000,5000),{totalCents:15000,balanceDueCents:10000});
});

test("rental swap applies linked component requirements and counts other booking lines",async()=>{
 const migration=await read("supabase/migrations/20260915000300_swap_booked_rental_item.sql");
 assert.match(migration,/rental_listing_inventory_requirements/);
 assert.match(migration,/v_item\.quantity\*requirement\.quantity_required/);
 assert.match(migration,/join public\.bookings booking on booking\.id=reservation\.booking_id/);
 assert.match(migration,/booking\.status in\('pending_payment','paid','confirmed'\)/);
});
