import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

const read=(path:string)=>readFile(resolve(process.cwd(),path),"utf8");

test("Thanksgiving cards mark inventory unavailable for the holiday rental window",async()=>{
 const landing=await read("components/ThanksgivingLanding.tsx");
 assert.match(landing,/booking_inventory_reservations/);
 assert.match(landing,/booking_amendment_inventory_holds/);
 assert.match(landing,/availableListingQuantity\(item,availableByResource\)<1/);
 assert.match(landing,/Already booked for Thanksgiving/);
});
