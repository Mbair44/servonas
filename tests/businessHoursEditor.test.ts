import assert from "node:assert/strict";
import test from "node:test";
import {applyBusinessHoursPreset,closedBusinessHoursValues,defaultBusinessHoursValues,detectBusinessHoursPreset} from "../lib/businessHoursEditor.ts";

test("new business hours default to Monday through Friday from nine to five",()=>{const rows=defaultBusinessHoursValues();assert.deepEqual(rows.filter(row=>row.open).map(row=>row.weekday),[1,2,3,4,5]);assert.ok(rows.every(row=>row.start==="09:00"&&row.end==="17:00"));assert.equal(detectBusinessHoursPreset(rows),"weekdays");});
test("an intentionally empty website schedule remains closed on every day",()=>{const rows=closedBusinessHoursValues();assert.equal(rows.length,7);assert.ok(rows.every(row=>!row.open));assert.equal(detectBusinessHoursPreset(rows),"custom");});
test("quick presets preserve the selected common time and set open days",()=>{const rows=defaultBusinessHoursValues().map(row=>row.weekday===1?{...row,start:"08:30",end:"16:30"}:row),daily=applyBusinessHoursPreset(rows,"daily");assert.ok(daily.every(row=>row.open&&row.start==="08:30"&&row.end==="16:30"));assert.equal(detectBusinessHoursPreset(daily),"daily");const saturday=applyBusinessHoursPreset(daily,"saturday");assert.equal(saturday.find(row=>row.weekday===0)?.open,false);assert.equal(saturday.find(row=>row.weekday===6)?.open,true);});
test("manually different schedules are represented as custom",()=>{const rows=defaultBusinessHoursValues().map(row=>row.weekday===3?{...row,end:"15:00"}:row);assert.equal(detectBusinessHoursPreset(rows),"custom");});
