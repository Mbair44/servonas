import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("party-rental checkout accepts verified delivery cities beyond the original pilot",async()=>{
 const migration=await read("supabase/migrations/20260907000200_remove_legacy_booking_city_allowlist.sql");
 assert.match(migration,/drop constraint if exists bookings_delivery_city_check/);
 assert.match(migration,/length\(btrim\(delivery_city\)\) between 1 and 120/);
 assert.doesNotMatch(migration,/delivery_city\s+in\s*\(/i);
});

test("checkout normalizes cities and hides database constraint details",async()=>{
 const route=await read("app/api/checkout/route.ts");
 assert.match(route,/body\.city=body\.city!\.trim\(\)\.replace\(\/\\s\+\/g," "\)\.slice\(0,120\)/);
 assert.match(route,/bookings_delivery_city_check\|delivery is currently available only/);
 assert.match(route,/We couldn't save that delivery city\./);
});
