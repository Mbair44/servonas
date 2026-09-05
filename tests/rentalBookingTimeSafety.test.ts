import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("party-rental time selection normalizes an invalid configured duration and keeps pricing errors in the booking UI",async()=>{
 const source=await readFile("components/PartyRentalBookingClient.tsx","utf8");
 assert.match(source,/const safePositiveNumber=/);
 assert.match(source,/const rentalDurationMinutes=Math\.max\(30,Math\.round\(safePositiveNumber\(standardDurationMinutes,240\)\)\)/);
 assert.match(source,/const durationForItem=/);
 assert.match(source,/const durationItems=selected\.length\?selected:availabilityItem\?\[availabilityItem\]:\[\]/);
 assert.match(source,/const selectedRentalDurationMinutes=durationItems\.length\?Math\.max\(\.\.\.durationItems\.map\(durationForItem\)\):rentalDurationMinutes/);
 assert.match(source,/const rentalPeriodFromStart=/);
 assert.match(source,/rentalPeriodFromStart\(baseDate,value,selectedRentalDurationMinutes\)/);
 assert.match(source,/!Number\.isNaN\(prettyDate\.getTime\(\)\)/);
 assert.match(source,/try\{const days=calculateRentalDays/);
 assert.match(source,/catch\{return \{\.\.\.fallback,error:"Choose a valid arrival time\."\};\}/);
 assert.match(source,/const pricingError=bookingItems\.map\(priced\)\.map\(price=>"error" in price\?price\.error:null\)/);
 assert.match(source,/if\(!date\|\|!startTime\)\{setBookingError\("Choose your event date and arrival time first\."\)/);
 assert.match(source,/onInput=\{event=>\{const value=event\.currentTarget\.value;if\(value!==startTime\)chooseStart\(value,date\);\}\}/);
 assert.match(source,/onChange=\{event=>\{const value=event\.currentTarget\.value;if\(value!==startTime\)chooseStart\(value,date\);\}\}/);
 assert.doesNotMatch(source,/disabled=\{submitting\|\|!date\|\|!startTime\|\|!endTime/);
});
