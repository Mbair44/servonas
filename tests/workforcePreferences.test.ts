import assert from "node:assert/strict";
import test from "node:test";
import {parseWorkTypes,validateWorkforcePreferences} from "../lib/workforcePreferences.ts";

test("normalizes unique work type labels",()=>{
 assert.deepEqual(parseWorkTypes("Maintenance, Install\nMaintenance"),["Maintenance","Install"]);
});
test("rejects contradictory employee preferences",()=>{
 assert.equal(validateWorkforcePreferences({preferred:["Install"],avoided:["Install"],start:"08:00",end:"17:00"}),"A work type cannot be both preferred and avoided.");
});
test("rejects reversed preferred hours",()=>{
 assert.equal(validateWorkforcePreferences({preferred:[],avoided:[],start:"17:00",end:"08:00"}),"Preferred end time must be after the start time.");
});
