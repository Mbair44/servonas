import assert from "node:assert/strict";
import test from "node:test";
import {formatPhoneInput} from "../lib/phoneFormatting.ts";

test("formats US phone numbers with hyphens",()=>{
 assert.equal(formatPhoneInput("4805550198"),"480-555-0198");
 assert.equal(formatPhoneInput("(480) 555-0198"),"480-555-0198");
 assert.equal(formatPhoneInput("14805550198"),"1-480-555-0198");
});

test("formats partial phone entry without inventing digits",()=>{
 assert.equal(formatPhoneInput("4805"),"480-5");
 assert.equal(formatPhoneInput("480555"),"480-555");
});

test("preserves non-US international phone entry",()=>{
 assert.equal(formatPhoneInput("+44 20 7946 0958"),"+44 20 7946 0958");
});
