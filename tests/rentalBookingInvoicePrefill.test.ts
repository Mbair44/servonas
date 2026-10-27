import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=()=>readFile(new URL("../app/app/[businessSlug]/invoices/new/page.tsx",import.meta.url),"utf8");

test("job-sourced invoices prefill tenant-scoped rental booking lines for review",async()=>{
 const source=await read();
 assert.match(source,/from\("bookings"\)[\s\S]*\.eq\("job_id",jobId\)\.eq\("business_id",business\.id\)\.maybeSingle\(\)/);
 assert.match(source,/booking_items\(quantity,unit_price_cents,option_adjustment_cents,duration_adjustment_cents,operator_charge_cents,item_name_snapshot,inventory_items\(name,is_taxable\)\)/);
 assert.match(source,/const rentalLines=\(sourceBooking\?\.booking_items\?\?\[\]\)\.flatMap/);
 assert.match(source,/initialLines=\{rentalLines\}/);
 assert.match(source,/initialFees=\{initialFees\}/);
 assert.match(source,/document_discount_type:bookingDiscountCents\?"fixed":"none"/);
});
