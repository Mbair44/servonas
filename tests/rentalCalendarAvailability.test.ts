import assert from "node:assert/strict";
import test from "node:test";
import {resolveRentalCalendarDayAvailability} from "../lib/rentalCalendarAvailability.ts";

const at=(hour:number,minute=0)=>new Date(Date.UTC(2026,7,21,hour,minute));
const base={openingStart:at(9),openingEnd:at(17),rentalDurationMinutes:240,turnaroundMinutes:0,stockQuantity:1,requestedQuantity:1,hardBlocked:false,reservations:[],businessBlackouts:[]};

test("an available rental date remains selectable",()=>assert.deepEqual(resolveRentalCalendarDayAvailability(base),{available:true}));
test("a fully reserved single-unit date is unavailable",()=>assert.deepEqual(resolveRentalCalendarDayAvailability({...base,reservations:[{startsAt:at(9),endsAt:at(17),quantity:1}]}),{available:false,reason:"reserved"}));
test("a partial reservation does not block a day with another valid time window",()=>assert.deepEqual(resolveRentalCalendarDayAvailability({...base,reservations:[{startsAt:at(9),endsAt:at(13),quantity:1}]}),{available:true}));
test("a multi-day reservation blocks every date with no valid remaining rental window",()=>assert.deepEqual(resolveRentalCalendarDayAvailability({...base,openingStart:new Date(Date.UTC(2026,7,22,9)),openingEnd:new Date(Date.UTC(2026,7,22,17)),reservations:[{startsAt:new Date(Date.UTC(2026,7,21,14)),endsAt:new Date(Date.UTC(2026,7,22,14)),quantity:1}]}),{available:false,reason:"reserved"}));
test("quantity availability respects remaining inventory",()=>{const reservations=[{startsAt:at(9),endsAt:at(17),quantity:6}];assert.equal(resolveRentalCalendarDayAvailability({...base,stockQuantity:10,requestedQuantity:4,reservations}).available,true);assert.deepEqual(resolveRentalCalendarDayAvailability({...base,stockQuantity:10,requestedQuantity:5,reservations}),{available:false,reason:"reserved"});});
test("manual business blockouts are unavailable without exposing reservation details",()=>assert.deepEqual(resolveRentalCalendarDayAvailability({...base,hardBlocked:true}),{available:false,reason:"blocked"}));
