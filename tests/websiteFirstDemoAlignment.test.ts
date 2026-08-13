import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("generated websites load their persisted website-first source",async()=>{const source=await read("lib/businessWebsite.ts");assert.match(source,/business_website_onboarding_states/);assert.match(source,/websiteSource:websiteOnboarding\?\.source/);});
test("pest-control generated sites mirror the pest demo language and default imagery",async()=>{const site=await read("components/BusinessWebsite.tsx");assert.match(site,/website-pest-control/);assert.match(site,/pest-control-technician-spraying\.png/);assert.match(site,/Protection built around your property/);assert.match(site,/Three simple steps to a more comfortable property/);});
test("car-detailing generated sites mirror the detailing demo language and default imagery",async()=>{const site=await read("components/BusinessWebsite.tsx");assert.match(site,/website-car-detailing/);assert.match(site,/car-detailing-professional-polishing\.png/);assert.match(site,/Purpose-built care for every finish/);assert.match(site,/Premium results, without the runaround/);});
test("industry alignment preserves live customer data and actions",async()=>{const site=await read("components/BusinessWebsite.tsx");for(const value of[/site\.name/,/site\.services/,/site\.serviceAreas/,/site\.hours/,/requestAction/,/site\.bookingUrl/,/site\.photoUrls/])assert.match(site,value);});
