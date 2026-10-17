import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("Copper State Bounce review offers an optional power question without a priced add-on",()=>{
 const source=read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/Need power for your inflatable\?/);
 assert.match(source,/I have access to electricity/);
 assert.match(source,/I need a generator \(\+\$150\)/);
 assert.match(source,/I&apos;m not sure/);
 assert.match(source,/not included in today&apos;s total/);
 assert.match(source,/name="powerNeed"/);
 assert.match(source,/businessSlug==="copper-state-bounce"/);
 assert.match(source,/rental-event-notes[\s\S]*\{powerQuestion\}/);
 assert.match(source,/selected\.length>0&&!showCheckout[\s\S]*\{powerQuestion\}/);
});

test("checkout saves only Copper State generator and follow-up requests as booking notes",()=>{
 const source=read("app/api/checkout/route.ts");
 assert.match(source,/COPPER_STATE_BOUNCE_BUSINESS_ID/);
 assert.match(source,/business\.id===COPPER_STATE_BOUNCE_BUSINESS_ID\?copperStatePowerRequestNote/);
 assert.match(source,/Generator Rental requested \(\+\$150\)/);
 assert.match(source,/not charged automatically/);
 assert.match(source,/Power follow-up required/);
 assert.match(source,/p_notes: bookingNotes/);
});

test("job creation already carries booking notes into the admin job description",()=>{
 const source=read("lib/rentalBookingJob.ts");
 assert.match(source,/booking\.notes\?`Notes: \$\{booking\.notes\}`:""/);
});
