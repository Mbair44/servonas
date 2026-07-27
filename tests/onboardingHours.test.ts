import assert from "node:assert/strict";
import test from "node:test";
import {defaultBusinessHours,validateBusinessHours} from "../lib/onboardingHours.ts";
test("business hours provide sensible weekday defaults",()=>{const rows=defaultBusinessHours();assert.equal(rows.filter(row=>row.open).length,5);assert.equal(validateBusinessHours(rows).form,null);});
test("business hours reject reversed ranges and every day closed",()=>{
 const reversed=defaultBusinessHours();reversed[1].end="08:00";assert.ok(validateBusinessHours(reversed).days[1]);
 assert.match(validateBusinessHours(defaultBusinessHours().map(row=>({...row,open:false}))).form??"",/one open day/i);
});
