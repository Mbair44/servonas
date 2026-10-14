import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("marketing funnel distinguishes broad booking interest from reservation-form checkout activity",async()=>{
 const page=await readFile(new URL("../app/app/[businessSlug]/marketing/funnel/page.tsx",import.meta.url),"utf8");
 assert.match(page,/<span>Booking interest<\/span>/);
 assert.match(page,/Sessions that clicked a rental, checked availability, or opened a reservation/);
 assert.match(page,/Booking interest is a broad intent signal/);
 assert.match(page,/Checkout activity starts only when the reservation form opens/);
 assert.match(page,/<b>Booking interest<\/b>/);
});
