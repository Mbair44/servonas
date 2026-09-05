import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("party-rental time selection reserves whole calendar days and keeps pricing errors in the booking UI",async()=>{
 const source=await readFile("components/PartyRentalBookingClient.tsx","utf8");
 assert.match(source,/const fullDayStartTime="00:00"/);
 assert.match(source,/const fullDayEndTime="23:59"/);
 assert.match(source,/setEndDate\(rangeEndOverride&&rangeEndOverride>=baseDate\?rangeEndOverride:baseDate\)/);
 assert.match(source,/setEndTime\(fullDayEndTime\)/);
 assert.match(source,/!Number\.isNaN\(prettyDate\.getTime\(\)\)/);
 assert.match(source,/try\{const days=calculateRentalCalendarDays\(date,endDate\)/);
 assert.match(source,/catch\{return \{\.\.\.fallback,error:"Choose a valid rental date\."\};\}/);
 assert.match(source,/const pricingError=bookingItems\.map\(priced\)\.map\(price=>"error" in price\?price\.error:null\)/);
 assert.match(source,/if\(!date\|\|!startTime\)\{setBookingError\("Choose your event date and arrival time first\."\)/);
 assert.match(source,/onInput=\{event=>\{const value=event\.currentTarget\.value;if\(value!==startTime\)chooseStart\(value,date\);\}\}/);
 assert.match(source,/onChange=\{event=>\{const value=event\.currentTarget\.value;if\(value!==startTime\)chooseStart\(value,date\);\}\}/);
 assert.match(source,/start=\$\{encodeURIComponent\(fullDayStartTime\)\}&end=\$\{encodeURIComponent\(fullDayEndTime\)\}/);
 assert.doesNotMatch(source,/rentalPeriodFromStart/);
 assert.doesNotMatch(source,/disabled=\{submitting\|\|!date\|\|!startTime\|\|!endTime/);
});
