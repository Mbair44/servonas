import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("rental checkout uses the calculated inventory power requirement without charging an unconfirmed generator",()=>{
 const source=read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/Do you have power for your inflatables\? <small>Optional<\/small>/);
 assert.match(source,/rentalPowerRequirement/);
 assert.match(source,/Separate electrical circuits may be required/);
 assert.match(source,/type="radio" name="power-need" value="electricity"/);
 assert.match(source,/Yes, I have power/);
 assert.match(source,/I need a generator/);
 assert.match(source,/I&apos;m not sure/);
 assert.match(source,/capacity require confirmation; it is not included in today&apos;s total/);
 assert.match(source,/name="powerNeed"/);
 assert.match(source,/rental-event-notes[\s\S]*\{powerQuestion\}/);
 assert.match(source,/selected\.length>0&&!showCheckout[\s\S]*\{powerQuestion\}/);
});

test("price-review warning renders only after the server reports a changed authoritative quote",()=>{
 const source=read("components/PartyRentalBookingClient.tsx");
 assert.match(source,/\{updatedQuote&&<p className="rental-price-review-notice" role="status">Prices are verified before payment/);
 assert.doesNotMatch(source,/<p>Prices are verified before payment\./);
});

test("checkout persists calculated power requirements and generator follow-up requests",()=>{
 const source=read("app/api/checkout/route.ts");
 assert.match(source,/rentalPowerRequirement\(orderedItems,requestedItems\)/);
 assert.match(source,/power_outlets_required/);
 assert.match(source,/generator_coverage_confirmed:false/);
 assert.match(source,/not charged automatically/);
 assert.match(source,/Power follow-up required/);
 assert.match(source,/p_notes: bookingNotes/);
});

test("job creation already carries booking notes into the admin job description",()=>{
 const source=read("lib/rentalBookingJob.ts");
 assert.match(source,/booking\.notes\?`Notes: \$\{booking\.notes\}`:""/);
});
