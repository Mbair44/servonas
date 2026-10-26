import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("Copper State Bounce review offers an optional, accessible power question without a priced add-on",()=>{
 const source=read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/Do you have power for your inflatable\? <small>Optional<\/small>/);
 assert.match(source,/A standard electrical outlet within 100 feet is needed\./);
 assert.match(source,/type="radio" name="power-need" value="electricity"/);
 assert.match(source,/Yes, I have power/);
 assert.match(source,/I need a generator/);
 assert.match(source,/className="rental-power-option-price">\+\$150/);
 assert.match(source,/I&apos;m not sure/);
 assert.match(source,/not included in today&apos;s total/);
 assert.match(source,/name="powerNeed"/);
 assert.match(source,/businessSlug==="copper-state-bounce"/);
 assert.match(source,/rental-event-notes[\s\S]*\{powerQuestion\}/);
 assert.match(source,/selected\.length>0&&!showCheckout[\s\S]*\{powerQuestion\}/);
});

test("price-review warning renders only after the server reports a changed authoritative quote",()=>{
 const source=read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/\{updatedQuote&&<p className="rental-price-review-notice" role="status">Prices are verified before payment/);
 assert.doesNotMatch(source,/<p>Prices are verified before payment\./);
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
