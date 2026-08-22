import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("rental inventory supports authenticated item-specific blocked dates without replacing business-wide blackouts",async()=>{
 const [page,actions,availability,bookingPage]=await Promise.all([
  readFile("app/app/[businessSlug]/rental-inventory/page.tsx","utf8"),
  readFile("app/app/[businessSlug]/rental-inventory/actions.ts","utf8"),
  readFile("app/api/public-booking/[businessSlug]/rental-availability/route.ts","utf8"),
  readFile("app/app/[businessSlug]/booking/page.tsx","utf8"),
 ]);
 assert.match(page,/Block this item on specific dates/);
 assert.match(page,/Use Online Booking → Blocked dates and times to block every rental/);
 assert.match(page,/name="startDate"/);
 assert.match(page,/name="endDate"/);
 assert.match(page,/Block item date range/);
 assert.match(page,/addRentalItemBlockedDate/);
 assert.match(actions,/export async function addRentalItemBlockedDate/);
 assert.match(actions,/eachDate/);
 assert.match(actions,/startDate/);
 assert.match(actions,/endDate/);
 assert.match(actions,/missingDates/);
 assert.match(actions,/\.eq\("business_id",business\.id\)/);
  assert.match(actions,/inventory_item_id:item\.id/);
 assert.match(actions,/export async function removeRentalItemBlockedDate/);
 assert.match(availability,/\.eq\("inventory_item_id",itemId\)/);
 assert.match(bookingPage,/Blocked dates and times/);
});
