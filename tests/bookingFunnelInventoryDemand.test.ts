import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("booking funnel reports most-clicked rental items from existing inventory funnel events",async()=>{
 const [page,styles,tracker,booking]=await Promise.all([
  read("app/app/[businessSlug]/marketing/funnel/page.tsx"),
  read("app/globals.css"),
  read("components/TenantBookingFunnelTracker.tsx"),
  read("components/PartyRentalBookingClient.tsx"),
 ]);
 assert.match(tracker,/inventoryItemId:options\.inventoryItemId/);
 assert.match(booking,/trackBookingFunnel\(businessSlug,"check_availability_clicked",\{inventoryItemId:itemId\}\)/);
 assert.match(page,/inventory_items\(name\)/);
 assert.match(page,/Most-clicked rental items/);
 assert.match(page,/which rentals visitors are trying to book/i);
 assert.match(page,/topInventoryRows/);
 assert.match(styles,/marketing-item-demand-table/);
});
