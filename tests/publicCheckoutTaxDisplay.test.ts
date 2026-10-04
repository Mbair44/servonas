import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("public checkout shows the authoritative sales-tax amount with the payment summary",async()=>{
 const source=await readFile(new URL("../components/PartyRentalBookingClient.tsx",import.meta.url),"utf8");
 assert.match(source,/updatedQuote&&<span>\{updatedQuote\.displayMode==="inclusive"\?"Included sales tax":"Sales tax"\}/);
 assert.match(source,/money\(updatedQuote\.taxCents\)/);
});
