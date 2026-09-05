import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("cart navigation requires a date and focuses the existing calendar",async()=>{
 const source=await readFile(new URL("../components/PartyRentalBookingClient.tsx",import.meta.url),"utf8");
 assert.match(source,/if\(!date\)\{setBookingError\("Choose your party date before viewing your cart\."\);setShowCheckout\(false\);focusDatePicker\("date_first"\);return;\}/);
});
