import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("customer rental confirmation is celebratory and omits travel distance",async()=>{
 const source=await readFile(new URL("../lib/communications/rentalBookingEmailService.ts",import.meta.url),"utf8");
 const customerSection=source.slice(0,source.indexOf("export async function sendRentalBookingBusinessNotification"));
 assert.match(customerSection,/🎉 You’re booked!/);
 assert.match(customerSection,/🎉 You’re booked for \$\{date\}/);
 assert.match(customerSection,/Delivery fee/);
 assert.doesNotMatch(customerSection,/delivery_distance_miles/);
 assert.doesNotMatch(customerSection,/Distance:/);
 assert.match(customerSection,/Remaining balance/);
});
