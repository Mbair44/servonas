import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("themed banner checkout route uses server prices and booking item reservations",async()=>{
 const route=await readFile(new URL("../app/api/checkout/route.ts",import.meta.url),"utf8");
 for(const expected of ["job_addon_catalog!inner(default_unit_price_cents,is_taxable,is_active,customer_visible,visibility)","amountCents:Number(selection.banner!.default_unit_price_cents)","themed_banner:${selection.bannerId}:${selection.inventoryItemId}","add_public_themed_banners_to_booking","bookingItemId:bookingItemByInventoryId.get(selection.inventoryItemId!)"])assert.ok(route.includes(expected),expected);
 assert.ok(!route.includes("themedBannerPriceCents"));
});
