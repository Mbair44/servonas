import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("party-rental time selection normalizes an invalid configured duration and keeps pricing errors in the booking UI",async()=>{
 const source=await readFile("components/PartyRentalBookingClient.tsx","utf8");
 assert.match(source,/const rentalDurationMinutes=Number\.isFinite\(standardDurationMinutes\)&&standardDurationMinutes>=30\?standardDurationMinutes:240/);
 assert.match(source,/const initialItemDurationMinutes=initialItem\?Math\.max\(30,Math\.round\(resolveRentalPricingRules\(businessPricing,initialItem\)\.standardRentalHours\*60\)\):rentalDurationMinutes/);
 assert.match(source,/hour\*60\+minute\+initialItemDurationMinutes/);
 assert.match(source,/try\{const days=calculateRentalDays/);
 assert.match(source,/error:error instanceof Error\?error\.message:"Choose a valid rental start and end time\."/);
 assert.match(source,/const pricingError=bookingItems\.map\(priced\)\.map\(price=>"error" in price\?price\.error:null\)/);
});
