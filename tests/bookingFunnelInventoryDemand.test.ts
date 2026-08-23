import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("booking funnel reports most-clicked rental items from dedicated click events",async()=>{
 const [page,styles,tracker,booking,funnel,migration]=await Promise.all([
  read("app/app/[businessSlug]/marketing/funnel/page.tsx"),
  read("app/globals.css"),
  read("components/TenantBookingFunnelTracker.tsx"),
  read("components/PartyRentalBookingClient.tsx"),
  read("app/api/public-booking/[businessSlug]/funnel/route.ts"),
  read("supabase/migrations/20260823000100_add_inventory_item_clicked_booking_event.sql"),
 ]);
 assert.match(tracker,/inventoryItemId:options\.inventoryItemId/);
 assert.match(booking,/trackBookingFunnel\(businessSlug,"check_availability_clicked",\{inventoryItemId:itemId\}\)/);
 assert.match(booking,/trackBookingFunnel\(businessSlug,"inventory_item_clicked"/);
 assert.match(funnel,/const allowed=new Set<string>\(bookingFunnelEvents\)/);
 assert.match(migration,/'inventory_item_clicked'/);
 assert.match(page,/inventory_items\(name\)/);
 assert.match(page,/Most-clicked rental items/);
 assert.match(page,/which rentals visitors are trying to book/i);
 assert.match(page,/if\(row\.event_name==="inventory_item_clicked"\)existing\.clicks\+\+/);
 assert.match(page,/topInventoryRows/);
 assert.match(styles,/marketing-item-demand-table/);
});

test("booking funnel queries date ranges in the business timezone instead of raw UTC calendar boundaries",async()=>{
 const page=await read("app/app/[businessSlug]/marketing/funnel/page.tsx");
 assert.match(page,/const today=dateInTimeZone\(new Date\(\),business\.timezone\)/);
 assert.match(page,/const rangeStart=zonedDateTimeToUtc\(from,"00:00",business\.timezone\)\.toISOString\(\)/);
 assert.match(page,/const rangeEnd=zonedDateTimeToUtc\(addDays\(to,1\),"00:00",business\.timezone\)\.toISOString\(\)/);
 assert.match(page,/\.gte\("occurred_at",rangeStart\)\.lt\("occurred_at",rangeEnd\)/);
 assert.doesNotMatch(page,/T00:00:00Z/);
 assert.doesNotMatch(page,/T23:59:59Z/);
});
